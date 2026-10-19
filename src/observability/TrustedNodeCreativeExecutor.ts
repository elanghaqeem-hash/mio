/**
 * PRV-10.06k — explicitly trusted, Node-main-only creative executor.
 *
 * This module intentionally has NO IPC handler and NO frontend import.
 * The embedding privileged process supplies an allowlisted executor and a
 * verified authorization callback. Neither policy nor execution is controlled
 * by an untrusted renderer.
 */
import type { MutationCheckpointIdentity } from './PersistentMutationCheckpointGate';
import { createExclusiveNodeCheckpointRuntime, type ExclusiveNodeCheckpointRuntime } from './ExclusiveNodeCheckpointRuntime';

export type TrustedCreativeMode = '3D' | 'GRAPHIC' | 'DRAWING';
export interface TrustedCreativeCommand {
  schemaVersion: 1;
  requestId: string;
  taskId: string;
  projectId: string;
  mode: TrustedCreativeMode;
  templateId: string;
}
export type TrustedCreativeReceipt =
  | { success: true; status: 'COMMITTED'; requestId: string; assetId: string }
  | { success: false; status: 'DENIED' | 'UNCERTAIN' | 'STOPPED_REVIEW'; requestId?: string; error: string; assetId?: string };
export interface TrustedCreativeAdapter {
  /** Privileged, independently verified user approval. Never trust renderer-supplied booleans or scopes. */
  authorize(command: TrustedCreativeCommand): Promise<boolean>;
  /** Privileged allowlisted deterministic engine; must reject unknown templates and never auto-retry. */
  execute(command: TrustedCreativeCommand): Promise<{ assetId: string }>;
}
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const MODES = new Set<TrustedCreativeMode>(['3D', 'GRAPHIC', 'DRAWING']);
const valid = (raw: unknown): raw is TrustedCreativeCommand => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return false;
  const item = raw as Record<string, unknown>;
  if (Object.keys(item).length !== 6 ||
      !['schemaVersion', 'requestId', 'taskId', 'projectId', 'mode', 'templateId'].every(key => Object.hasOwn(item, key)) ||
      item.schemaVersion !== 1 || !MODES.has(item.mode as TrustedCreativeMode)) return false;
  return ['requestId', 'taskId', 'projectId', 'templateId'].every(key => typeof item[key] === 'string' && SAFE_ID.test(item[key] as string));
};

export class TrustedNodeCreativeExecutor {
  private stopped = false;
  private readonly inFlight = new Set<string>();
  private readonly admitted = new Set<string>();
  constructor(
    private readonly checkpointRuntime: Pick<ExclusiveNodeCheckpointRuntime, 'gate' | 'stop' | 'activeCount' | 'close'>,
    private readonly adapter: TrustedCreativeAdapter,
  ) {}

  stop(): void {
    this.stopped = true;
    this.checkpointRuntime.stop();
  }

  activeCount(): number { return this.inFlight.size; }

  /** Graceful close only after every effect and its checkpoint have settled. */
  close(): void {
    if (this.inFlight.size) throw new Error('CREATIVE_RUNTIME_DRAIN_REQUIRED');
    this.stop();
    this.checkpointRuntime.close();
  }

  async invoke(raw: unknown): Promise<TrustedCreativeReceipt> {
    if (!valid(raw)) return { success: false, status: 'DENIED', error: 'CREATIVE_COMMAND_INVALID' };
    const command = raw;
    const key = JSON.stringify([command.projectId, command.taskId, command.requestId]);
    if (this.stopped || this.inFlight.has(key) || this.admitted.has(key)) {
      return { success: false, status: 'DENIED', requestId: command.requestId, error: 'CREATIVE_STOPPED_OR_DUPLICATE' };
    }
    // Reserve a local session slot BEFORE awaiting approval: identical in-flight calls cannot race.
    this.inFlight.add(key);
    try {
      let approved: boolean;
      try { approved = await this.adapter.authorize(command); }
      catch { return { success: false, status: 'DENIED', requestId: command.requestId, error: 'CREATIVE_APPROVAL_UNAVAILABLE' }; }
      if (!approved || this.stopped) {
        return { success: false, status: 'DENIED', requestId: command.requestId, error: 'CREATIVE_NOT_AUTHORIZED_OR_STOPPED' };
      }
      const identity: MutationCheckpointIdentity = {
        projectId: command.projectId, taskId: command.taskId, requestId: command.requestId,
        capabilityId: 'creative.trusted-template.' + command.mode,
      };
      // A request may already exist on disk after crash/restart: the gate denies it.
      try { await this.checkpointRuntime.gate.begin(identity); }
      catch {
        this.stop(); // Unknown write state: no other operation admitted without review.
        return { success: false, status: 'UNCERTAIN', requestId: command.requestId, error: 'CREATIVE_CHECKPOINT_ADMISSION_FAILED' };
      }
      this.admitted.add(key);
      if (this.stopped) {
        try { await this.checkpointRuntime.gate.complete(identity, false); }
        catch { this.stop(); }
        return { success: false, status: 'STOPPED_REVIEW', requestId: command.requestId, error: 'CREATIVE_STOPPED_BEFORE_EXECUTION' };
      }
      let assetId: string | undefined;
      try {
        const output = await this.adapter.execute(command);
        if (!output || typeof output.assetId !== 'string' || !SAFE_ID.test(output.assetId))
          throw new Error('CREATIVE_OUTPUT_INVALID');
        assetId = output.assetId;
      } catch {
        try { await this.checkpointRuntime.gate.complete(identity, false); }
        catch { this.stop(); }
        return { success: false, status: 'UNCERTAIN', requestId: command.requestId, error: 'CREATIVE_EFFECT_UNCERTAIN' };
      }
      try { await this.checkpointRuntime.gate.complete(identity, true); }
      catch {
        this.stop();
        return { success: false, status: 'UNCERTAIN', requestId: command.requestId, error: 'CREATIVE_COMMIT_CONFIRMATION_FAILED' };
      }
      if (this.stopped) {
        return { success: false, status: 'STOPPED_REVIEW', requestId: command.requestId, assetId,
          error: 'CREATIVE_EFFECT_COMMITTED_AFTER_STOP' };
      }
      return { success: true, status: 'COMMITTED', requestId: command.requestId, assetId };
    } finally {
      this.inFlight.delete(key);
    }
  }
}

/** Node-only composition root. No dynamic renderer-provided callback or filesystem path. */
export function createTrustedNodeCreativeExecutor(userDataRoot: string, adapter: TrustedCreativeAdapter): TrustedNodeCreativeExecutor {
  return new TrustedNodeCreativeExecutor(createExclusiveNodeCheckpointRuntime(userDataRoot), adapter);
}
