/**
 * MIO-PRV-10.01 — bounded, project-scoped execution trace ledger.
 * Metadata only: never store prompts, response bodies, credentials, paths or raw tool arguments.
 * This is an opt-in foundation, not yet wired to all producers or durable storage.
 */
import { MIO_CONTRACT_SCHEMA_VERSION, type MioExecutionTrace, type MioTraceSpan, type MioTraceStatus } from '../contracts/MioContracts';
import { validateMioExecutionTrace } from '../contracts/MioContractValidation';

export interface TraceIdentity {
  traceId: string;
  requestId: string;
  taskId: string;
  capabilityId: string;
  projectId: string;
}
export type TraceOutcome = Exclude<MioTraceStatus, 'RUNNING'>;
type TraceRecord = { projectId: string; trace: MioExecutionTrace };
const MAX_TRACES = 100;
const MAX_SPANS_PER_TRACE = 100;
const TERMINAL = new Set<MioTraceStatus>(['SUCCEEDED', 'FAILED', 'CANCELLED', 'BLOCKED']);
const SAFE_ID = /^[a-zA-Z0-9_.:-]{1,200}$/;
const validTime = (value: number): boolean => Number.isFinite(value) && value >= 0;
const copy = (record: MioExecutionTrace): MioExecutionTrace => ({
  ...record,
  spans: record.spans.map(span => ({
    ...span,
    ...(span.usage ? { usage: { ...span.usage } } : {}),
  })),
});
/** In-memory trace metadata. Every lookup requires the owning project ID. */
export class MioTraceLedger {
  private readonly records = new Map<string, TraceRecord>();
  private readonly maxTraces: number;
  constructor(maxTraces = MAX_TRACES) {
    if (!Number.isSafeInteger(maxTraces) || maxTraces < 1 || maxTraces > 1000) throw new Error('TRACE_LIMIT_INVALID');
    this.maxTraces = maxTraces;
  }
  begin(identity: TraceIdentity, startedAt = Date.now()): MioExecutionTrace {
    for (const value of Object.values(identity)) if (!SAFE_ID.test(value)) throw new Error('TRACE_ID_INVALID');
    if (!validTime(startedAt)) throw new Error('TRACE_TIME_INVALID');
    if (this.records.has(identity.traceId)) throw new Error('TRACE_ALREADY_EXISTS');
    while (this.records.size >= this.maxTraces) {
      const oldest = this.records.keys().next().value;
      if (oldest === undefined) break;
      this.records.delete(oldest);
    }
    const trace: MioExecutionTrace = {
      schemaVersion: MIO_CONTRACT_SCHEMA_VERSION,
      traceId: identity.traceId,
      requestId: identity.requestId,
      taskId: identity.taskId,
      capabilityId: identity.capabilityId,
      status: 'RUNNING',
      startedAt,
      spans: [],
    };
    const validated = validateMioExecutionTrace(trace);
    if (!validated.ok) throw new Error('TRACE_CONTRACT_INVALID');
    this.records.set(trace.traceId, { projectId: identity.projectId, trace });
    return copy(trace);
  }
  private owned(traceId: string, projectId: string): MioExecutionTrace {
    const entry = this.records.get(traceId);
    if (!entry || entry.projectId !== projectId) throw new Error('TRACE_NOT_FOUND');
    return entry.trace;
  }
  append(traceId: string, projectId: string, span: MioTraceSpan): MioExecutionTrace {
    const trace = this.owned(traceId, projectId);
    if (trace.status !== 'RUNNING') throw new Error('TRACE_CLOSED');
    if (trace.spans.length >= MAX_SPANS_PER_TRACE) throw new Error('TRACE_SPAN_LIMIT');
    // Whitelist metadata. Never persist arbitrary detail, even if it passes core validation.
    const safeSpan: MioTraceSpan = {
      id: span.id, kind: span.kind, name: span.name,
      startedAt: span.startedAt, status: span.status,
      ...(span.finishedAt !== undefined ? { finishedAt: span.finishedAt } : {}),
      ...(span.parentId !== undefined ? { parentId: span.parentId } : {}),
      ...(span.locality !== undefined ? { locality: span.locality } : {}),
      ...(span.usage ? { usage: { ...span.usage } } : {}),
    };
    if (!SAFE_ID.test(safeSpan.id) || !SAFE_ID.test(safeSpan.name)) throw new Error('TRACE_SPAN_METADATA_INVALID');
    if (trace.spans.some(x => x.id === safeSpan.id)) throw new Error('TRACE_SPAN_DUPLICATE');
    if (!validTime(safeSpan.startedAt) || safeSpan.startedAt < trace.startedAt ||
        (safeSpan.finishedAt !== undefined && (!validTime(safeSpan.finishedAt) || safeSpan.finishedAt < safeSpan.startedAt)))
      throw new Error('TRACE_SPAN_TIME_INVALID');
    if (safeSpan.parentId && !trace.spans.some(x => x.id === safeSpan.parentId)) throw new Error('TRACE_PARENT_MISSING');
    const candidate = { ...trace, spans: [...trace.spans, safeSpan] };
    if (!validateMioExecutionTrace(candidate).ok) throw new Error('TRACE_SPAN_CONTRACT_INVALID');
    trace.spans.push(safeSpan);
    return copy(trace);
  }
  finish(traceId: string, projectId: string, status: TraceOutcome, finishedAt = Date.now()): MioExecutionTrace {
    const trace = this.owned(traceId, projectId);
    if (trace.status !== 'RUNNING') throw new Error('TRACE_CLOSED');
    if (!TERMINAL.has(status) || !validTime(finishedAt) || finishedAt < trace.startedAt ||
        trace.spans.some(span => span.finishedAt !== undefined && span.finishedAt > finishedAt))
      throw new Error('TRACE_FINISH_INVALID');
    const candidate: MioExecutionTrace = { ...trace, status, finishedAt };
    if (!validateMioExecutionTrace(candidate).ok) throw new Error('TRACE_CONTRACT_INVALID');
    trace.status = status;
    trace.finishedAt = finishedAt;
    return copy(trace);
  }
  get(traceId: string, projectId: string): MioExecutionTrace | undefined {
    const entry = this.records.get(traceId);
    return entry?.projectId === projectId ? copy(entry.trace) : undefined;
  }
  list(projectId: string): MioExecutionTrace[] {
    return [...this.records.values()].filter(record => record.projectId === projectId).map(record => copy(record.trace));
  }
  clear(projectId: string): number {
    let removed = 0;
    for (const [id, entry] of this.records) {
      if (entry.projectId === projectId) { this.records.delete(id); removed++; }
    }
    return removed;
  }
}
