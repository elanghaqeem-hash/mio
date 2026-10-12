// MIO-PRV-03.06: puts the live chat context (TP-0.45 assembly) through the UnifiedContextEngine.
// The existing envelopes stay the transport, so EvidenceGrounding and the ModelRouter materializers
// keep working; the engine decides which of their sources survive and how they are trusted, and adds
// task and permission state as a separate data block.
import type { ApplicationContextEnvelope, MemoryContextEnvelope } from '../../types/models';
import type { AuthorizationGrant } from '../../types/security';
import type { RuntimeTask } from '../../types/tasks';
import type { MioEvidenceKind } from '../../contracts/MioContracts';
import type { ModelContextAssembly } from './ModelContextAssembler';
import {
  MAX_CONTEXT_BUDGET, candidateFromPermissionState, candidateFromTask, candidatesFromModelContextAssembly, selectContext, serializeUnifiedContext,
  type UnifiedContextBundle,
} from './UnifiedContextEngine';

export const RUNTIME_STATE_BUDGET = 1200;

export interface GovernedContext {
  applicationContext?: ApplicationContextEnvelope;
  memoryContext?: MemoryContextEnvelope;
  /** Serialized task/permission state block, or undefined when there is none. */
  runtimeContext?: string;
  bundle: UnifiedContextBundle;
}

const key = (kind: MioEvidenceKind, id: string): string => `${kind}:${id}`;

export function governAssembledContext(
  assembly: ModelContextAssembly,
  input: { projectId: string; taskId: string; query: string; task?: RuntimeTask; grants?: readonly AuthorizationGrant[]; now?: number },
): GovernedContext {
  const now = input.now ?? Date.now();
  const application = assembly.projectKnowledge.applicationContext;
  const knowledgeBudget = application?.contextBudgetChars ?? 0;
  const memoryBudget = assembly.memoryContext?.contextBudgetChars ?? 0;
  const runtimeCandidates = [
    ...(input.task ? [candidateFromTask(input.task, now)] : []),
    candidateFromPermissionState(input.projectId, input.taskId, input.grants ?? [], now),
  ];
  const budgetChars = Math.min(MAX_CONTEXT_BUDGET, knowledgeBudget + memoryBudget + RUNTIME_STATE_BUDGET);
  // Each kind keeps exactly the budget it had before, so context that used to fit still fits.
  const share = (chars: number): number => (budgetChars > 0 ? Math.min(1, chars / budgetChars) : 0);
  const bundle = selectContext([...candidatesFromModelContextAssembly(assembly, input.projectId, now), ...runtimeCandidates], {
    projectId: input.projectId,
    taskId: input.taskId,
    query: input.query,
    budgetChars,
    maxShareByKind: { PROJECT_KNOWLEDGE: share(knowledgeBudget), MEMORY: share(memoryBudget), TASK_STATE: share(RUNTIME_STATE_BUDGET), PERMISSION_STATE: share(RUNTIME_STATE_BUDGET) },
  });

  const kept = new Map(bundle.items.map(item => [key(item.evidence.kind, item.evidence.id), item]));
  const knowledgeSources = (application?.sources ?? [])
    .filter(source => kept.has(key('PROJECT_KNOWLEDGE', source.id)))
    .map(source => (kept.get(key('PROJECT_KNOWLEDGE', source.id))?.injectionFlagged ? { ...source, trust: 'QUARANTINED' as const } : source));
  const memorySources = (assembly.memoryContext?.sources ?? [])
    .filter(source => kept.has(key('MEMORY', source.id)))
    .map(source => (kept.get(key('MEMORY', source.id))?.injectionFlagged ? { ...source, trust: 'SYSTEM_DERIVED' as const } : source));
  const runtimeItems = bundle.items.filter(item => item.evidence.kind === 'TASK_STATE' || item.evidence.kind === 'PERMISSION_STATE');

  return {
    applicationContext: application && knowledgeSources.length ? { ...application, sources: knowledgeSources } : undefined,
    memoryContext: assembly.memoryContext && memorySources.length ? { ...assembly.memoryContext, sources: memorySources } : undefined,
    runtimeContext: runtimeItems.length ? serializeUnifiedContext({ ...bundle, items: runtimeItems }) : undefined,
    bundle,
  };
}
