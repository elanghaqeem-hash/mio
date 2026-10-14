/**
 * PRV-10.02 — safe capability-result observer for the shared execution trace ledger.
 * One trace can contain multiple capability calls in the same project. Recording is best-effort,
 * never changes authorization, outcomes or retries, and contains metadata only.
 */
import type { MioCapabilityRequest, MioCapabilityResult } from '../contracts/MioContracts';
import { MioTraceLedger } from './MioTraceLedger';

export class MioCapabilityTraceRecorder {
  constructor(readonly ledger = new MioTraceLedger()) {}
  observe(request: MioCapabilityRequest, result: MioCapabilityResult): void {
    const context = request?.context;
    if (!context?.projectId || !context.traceId || !context.taskId) return;
    if (result.requestId !== request.requestId || result.capabilityId !== request.capabilityId ||
        result.trace.traceId !== context.traceId || result.trace.taskId !== context.taskId) return;
    // Unknown or terminal trace states must not disrupt the underlying capability call.
    try {
      if (!this.ledger.get(context.traceId, context.projectId)) {
        this.ledger.begin({
          traceId: context.traceId,
          requestId: request.requestId,
          taskId: context.taskId,
          capabilityId: request.capabilityId,
          projectId: context.projectId,
        }, result.trace.startedAt);
      }
      for (const span of result.trace.spans) {
        // The ledger's metadata allowlist drops free-form provider messages.
        this.ledger.append(context.traceId, context.projectId, span);
      }
    } catch {
      // Observability must never alter a model/tool result or change permission enforcement.
    }
  }
}
