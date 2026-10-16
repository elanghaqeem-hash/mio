// MIO-PRV-05.03: the Unified Capability Protocol. The agent discovers capabilities from their manifests and
// invokes every one of them the same way: a MioCapabilityRequest in, a MioCapabilityResult out. The protocol
// admits the call (contract, manifest, mode/scope, declared permission, STOP/cancellation), bounds it (input
// size and schema, timeout, budget), dispatches it to its executor (ToolRouter, SecureServiceGateway, or a
// native executor, which keep their own permission and resource gates), validates the output, and audits it.
import type { MioMutationCheckpointGate, MutationCheckpointIdentity } from '../observability/PersistentMutationCheckpointGate';
import { MIO_CONTRACT_SCHEMA_VERSION, MIO_PERMISSION_LEVELS, type MioArtifact, type MioCapabilityRequest, type MioCapabilityResult, type MioEvidence, type MioMutationState, type MioRuntimeErrorCode, type MioTraceStatus } from '../contracts/MioContracts';
import { validateMioCapabilityRequest } from '../contracts/MioContractValidation';
import { emergencyStop } from '../core/EmergencyStop';
import { eventBus } from '../core/EventBus';
import { taskRuntime } from '../orchestrator/TaskRuntime';
import { CapabilityRegistry, defaultCapabilityRegistry } from '../security/CapabilityRegistry';
import { redactSecretText } from '../security/SecretRedaction';
import type { CapabilityExecutionContext } from '../types/capabilities';
import type { SecurityEvent } from '../types/security';
import { descriptorOf, jsonByteLength, validateAgainstSchema, validateCapabilityManifest, type MioCapabilityManifest } from './CapabilityManifest';

export type MioCapabilityOutcome<O = unknown> =
  | { ok: true; output: O; validation?: 'PASSED' | 'NOT_REQUIRED'; evidence?: MioEvidence[]; artifacts?: MioArtifact[] }
  | { ok: false; code: MioRuntimeErrorCode; message: string; mutationState?: MioMutationState };

export type MioCapabilityExecutor<I = unknown, O = unknown> = (input: I, context: CapabilityExecutionContext & { signal: AbortSignal; requestId: string }) => Promise<MioCapabilityOutcome<O>>;

const RETRYABLE: ReadonlySet<MioRuntimeErrorCode> = new Set(['TIMEOUT', 'PROVIDER_FAILED']);
const rank = (level: string) => (MIO_PERMISSION_LEVELS as readonly string[]).indexOf(level);
const safeId = (value: unknown, fallback: string) => (typeof value === 'string' && /^\S{1,200}$/.test(value) ? value : fallback);

export class CapabilityProtocol {
  private readonly entries = new Map<string, { manifest: MioCapabilityManifest; executor: MioCapabilityExecutor<any, any> }>();
  private sequence = 0;

  constructor(private readonly registry: CapabilityRegistry = defaultCapabilityRegistry, private readonly onResult?: (request: MioCapabilityRequest, result: MioCapabilityResult) => void, private readonly checkpointGate?: MioMutationCheckpointGate) {}

  /**
   * Declares a capability. Its manifest must be structurally valid, and the CapabilityRegistry entry (registered
   * here when absent) must match it exactly, so the registry, the executors, and the protocol never disagree.
   */
  public declare<I, O>(manifest: MioCapabilityManifest, executor: MioCapabilityExecutor<I, O>): void {
    const errors = validateCapabilityManifest(manifest);
    if (errors.length) throw new Error(`Invalid capability manifest: ${errors.join('; ')}`);
    if (this.entries.has(manifest.id)) throw new Error(`Capability '${manifest.id}' is already declared`);
    const descriptor = descriptorOf(manifest);
    const registered = this.registry.get(manifest.id);
    if (!registered) this.registry.register(descriptor);
    else if (JSON.stringify({ ...registered, modes: [...registered.modes].sort(), scopeFields: [...registered.scopeFields].sort() }) !== JSON.stringify({ ...descriptor, modes: [...descriptor.modes].sort(), scopeFields: [...descriptor.scopeFields].sort() })) {
      throw new Error(`Capability '${manifest.id}' manifest differs from its CapabilityRegistry entry`);
    }
    this.entries.set(manifest.id, { manifest: structuredClone(manifest), executor });
  }

  public has(capabilityId: string): boolean { return this.entries.has(capabilityId); }

  public manifest(capabilityId: string): MioCapabilityManifest | undefined {
    const entry = this.entries.get(capabilityId);
    return entry ? structuredClone(entry.manifest) : undefined;
  }

  /** The capabilities the agent may call in `mode` in this runtime (declared, available, and allowed in the mode). */
  public discover(mode?: CapabilityExecutionContext['mode']): MioCapabilityManifest[] {
    return [...this.entries.values()]
      .map(({ manifest }) => manifest)
      .filter((manifest) => this.registry.get(manifest.id)?.availability === 'AVAILABLE' && (!mode || manifest.modes.includes(mode)))
      .map((manifest) => structuredClone(manifest));
  }

  public async invoke<O = unknown>(request: MioCapabilityRequest): Promise<MioCapabilityResult<O>> {
    const startedAt = Date.now();
    const requestId = safeId((request as { requestId?: unknown } | null)?.requestId, `invalid_request_${++this.sequence}`);
    const capabilityId = safeId((request as { capabilityId?: unknown } | null)?.capabilityId, 'unknown');
    const contract = validateMioCapabilityRequest(request);
    if (!contract.ok) return this.finish(request, requestId, capabilityId, startedAt, undefined, { code: 'VALIDATION_FAILED', message: `Capability request is invalid: ${contract.errors.slice(0, 3).join('; ')}`, status: 'FAILED' });

    const entry = this.entries.get(capabilityId);
    if (!entry) return this.finish(request, requestId, capabilityId, startedAt, undefined, { code: 'CAPABILITY_UNAVAILABLE', message: `Capability '${capabilityId}' is not declared in the capability protocol`, status: 'DENIED' });
    const { manifest, executor } = entry;
    const context: CapabilityExecutionContext = {
      taskId: request.context.taskId,
      mode: request.context.mode,
      projectId: request.context.projectId,
      requestedBy: request.context.requestedBy,
      toolId: manifest.kind === 'TOOL' ? manifest.id : undefined,
      resourceId: request.permission.resourceId ?? (manifest.kind === 'TOOL' ? `tool:${manifest.id}` : undefined),
      path: request.permission.path,
      networkOrigin: request.permission.networkOrigin,
    };

    const admitted = this.registry.authorize(manifest.id, context);
    if (!admitted.allowed) {
      const unavailable = this.registry.get(manifest.id)?.availability !== 'AVAILABLE';
      return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: unavailable ? 'CAPABILITY_UNAVAILABLE' : 'PERMISSION_DENIED', message: admitted.reason ?? 'Capability manifest rejected the request', status: 'DENIED' });
    }
    if (rank(request.permission.level) < rank(manifest.permissionLevel)) {
      return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: 'PERMISSION_DENIED', message: `Request declares ${request.permission.level}, but ${manifest.id} requires ${manifest.permissionLevel}`, status: 'DENIED' });
    }
    if (emergencyStop.isEmergencyStopped() || taskRuntime.isCancelled(context.taskId)) {
      return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: 'CANCELLED', message: 'Capability call cancelled before execution', status: 'CANCELLED' });
    }
    const inputBytes = jsonByteLength(request.input);
    if (inputBytes > manifest.limits.maxInputBytes) {
      return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: 'VALIDATION_FAILED', message: `Input is ${inputBytes} bytes; ${manifest.id} accepts at most ${manifest.limits.maxInputBytes}`, status: 'FAILED' });
    }
    const inputErrors = validateAgainstSchema(request.input, manifest.inputSchema, 'input');
    if (inputErrors.length) return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: 'VALIDATION_FAILED', message: `Input does not match the ${manifest.id} schema: ${inputErrors.slice(0, 3).join('; ')}`, status: 'FAILED' });

    // Mutations crossing domains are allowed only after durable pre-execution checkpoints succeed.
    // This gate is explicitly injected by a runtime with a verified durable backend.
    const checkpoint: MutationCheckpointIdentity | undefined = manifest.mutates && this.checkpointGate
      ? { projectId: request.context.projectId ?? '', taskId: request.context.taskId, requestId, capabilityId }
      : undefined;
    if (checkpoint) {
      if (!checkpoint.projectId) return this.finish(request, requestId, capabilityId, startedAt, manifest,
        { code: 'POLICY_BLOCKED', message: 'Durable mutation checkpoint requires a project', status: 'DENIED' });
      try { await this.checkpointGate!.begin(checkpoint); }
      catch { return this.finish(request, requestId, capabilityId, startedAt, manifest,
        { code: 'POLICY_BLOCKED', message: 'Durable mutation checkpoint unavailable or duplicate; execution denied', status: 'DENIED' }); }
    }
    const settle = async (committed: boolean): Promise<boolean> => {
      if (!checkpoint) return true;
      try { await this.checkpointGate!.complete(checkpoint, committed); return true; }
      catch { return false; }
    };
    const unknownCheckpointFailure = () => this.finish<O>(request, requestId, capabilityId, startedAt, manifest,
      { code: 'PROVIDER_FAILED', message: 'Mutation status uncertain: checkpoint confirmation failed; manual review required', status: 'FAILED', executed: true, mutationState: 'UNKNOWN' });

    const timeoutMs = Math.max(1, Math.min(manifest.timeoutMs, request.budget?.maxDurationMs ?? manifest.timeoutMs));
    const controller = new AbortController();
    let stopReason: 'TIMEOUT' | 'CANCELLED' | undefined;
    const abort = (reason: 'TIMEOUT' | 'CANCELLED') => { if (!stopReason) { stopReason = reason; controller.abort(); } };
    const unregisterStop = emergencyStop.registerAbortHandler(() => abort('CANCELLED'));
    const unregisterTask = taskRuntime.registerCancellationHandler(context.taskId, () => abort('CANCELLED'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<MioCapabilityOutcome<O>>((resolve) => {
      timer = setTimeout(() => abort('TIMEOUT'), timeoutMs);
      controller.signal.addEventListener('abort', () => resolve({ ok: false, code: stopReason ?? 'CANCELLED', message: stopReason === 'TIMEOUT' ? `${manifest.id} timed out after ${timeoutMs}ms` : `${manifest.id} was cancelled` }), { once: true });
    });
    let outcome: MioCapabilityOutcome<O>;
    try {
      outcome = await Promise.race([
        Promise.resolve().then(() => executor(request.input, { ...context, signal: controller.signal, requestId })).catch((error: unknown): MioCapabilityOutcome<O> => ({ ok: false, code: 'PROVIDER_FAILED', message: error instanceof Error ? error.message : String(error) })),
        interrupted,
      ]);
    } finally {
      clearTimeout(timer);
      unregisterStop();
      unregisterTask();
    }
    if (stopReason && outcome.ok) outcome = { ok: false, code: stopReason, message: `${manifest.id} ${stopReason === 'TIMEOUT' ? 'timed out' : 'was cancelled'}` };
    if (!outcome.ok) {
      if (!(await settle(false))) return unknownCheckpointFailure();
      return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: outcome.code, message: outcome.message, status: outcome.code === 'CANCELLED' ? 'CANCELLED' : outcome.code === 'PERMISSION_DENIED' ? 'DENIED' : 'FAILED', executed: true, mutationState: outcome.mutationState });
    }

    const outputBytes = jsonByteLength(outcome.output);
    const outputErrors = outputBytes > manifest.limits.maxOutputBytes
      ? [`output is ${outputBytes} bytes; at most ${manifest.limits.maxOutputBytes} allowed`]
      : validateAgainstSchema(outcome.output, manifest.outputSchema, 'output');
    if (outputErrors.length) {
      if (!(await settle(false))) return unknownCheckpointFailure();
      return this.finish(request, requestId, capabilityId, startedAt, manifest, { code: 'VALIDATION_FAILED', message: `Output rejected: ${outputErrors.slice(0, 3).join('; ')}`, status: 'FAILED', executed: true });
    }
    if (!(await settle(true))) return unknownCheckpointFailure();
    return this.finish(request, requestId, capabilityId, startedAt, manifest, undefined, outcome);
  }

  private finish<O>(
    request: MioCapabilityRequest,
    requestId: string,
    capabilityId: string,
    startedAt: number,
    manifest: MioCapabilityManifest | undefined,
    failure?: { code: MioRuntimeErrorCode; message: string; status: 'FAILED' | 'DENIED' | 'CANCELLED'; executed?: boolean; mutationState?: MioMutationState },
    success?: Extract<MioCapabilityOutcome<O>, { ok: true }>,
  ): MioCapabilityResult<O> {
    const finishedAt = Math.max(startedAt, Date.now());
    const status: MioTraceStatus = success ? 'SUCCEEDED' : failure?.status === 'DENIED' ? 'BLOCKED' : failure?.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
    const context = (request as Partial<MioCapabilityRequest> | null)?.context;
    const trace = {
      schemaVersion: MIO_CONTRACT_SCHEMA_VERSION,
      traceId: safeId(context?.traceId, `trace_${requestId}`),
      requestId,
      capabilityId,
      taskId: safeId(context?.taskId, 'unknown_task'),
      status,
      startedAt,
      finishedAt,
      spans: [{ id: `${requestId}:capability`, kind: 'CAPABILITY_CALL' as const, name: capabilityId, startedAt, finishedAt, status }],
    };
    const base = { schemaVersion: MIO_CONTRACT_SCHEMA_VERSION, requestId, capabilityId, trace };
    // A call that ran and can mutate state may have changed something before failing: its outcome is UNKNOWN,
    // and the contract forbids marking it retryable.
    const mutationState: MioMutationState = failure?.mutationState ?? (failure?.executed && manifest?.mutates ? 'UNKNOWN' : 'NONE');
    const message = redactSecretText(failure?.message ?? '').slice(0, 4000) || 'Capability call failed';
    const result: MioCapabilityResult<O> = success
      ? { ...base, status: 'SUCCEEDED', output: success.output, validation: success.validation ?? 'PASSED', evidence: success.evidence ?? [], artifacts: success.artifacts ?? [] }
      : { ...base, status: failure!.status, evidence: [], artifacts: [], error: { code: failure!.code, message, retryable: RETRYABLE.has(failure!.code) && mutationState === 'NONE', mutationState, capabilityId } };
    if (!manifest || manifest.audit === 'ALWAYS' || !success) this.audit(result, manifest);
    eventBus.emit('CAPABILITY_PROTOCOL_RESULT', { requestId, capabilityId, status: result.status, taskId: trace.taskId, durationMs: finishedAt - startedAt });
    try { this.onResult?.(request, result); } catch { /* tracing must not alter the capability outcome */ }
    return result;
  }

  private audit(result: MioCapabilityResult, manifest: MioCapabilityManifest | undefined): void {
    const succeeded = result.status === 'SUCCEEDED';
    eventBus.emit<SecurityEvent>('SECURITY_EVENT', {
      id: `capability_${result.requestId}_${Date.now()}`,
      timestamp: Date.now(),
      level: succeeded ? 'info' : result.status === 'DENIED' ? 'blocked' : 'warning',
      category: 'TOOL_EXECUTION',
      action: `CAPABILITY:${result.capabilityId}`,
      details: succeeded
        ? `${result.capabilityId} succeeded (${manifest?.domain ?? 'UNKNOWN'}, ${manifest?.permissionLevel ?? 'n/a'})`
        : `${result.capabilityId} ${result.status}: ${result.error.code}: ${result.error.message}`,
      blocked: result.status === 'DENIED',
    });
  }
}
