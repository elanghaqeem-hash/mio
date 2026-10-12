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
  candidateFromPermissionState, candidateFromTask, candidatesFromModelContextAssembly, selectContext, serializeUnifiedContext,
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
  // The assemblers already applied their budgets (admitting a first item even when it is oversized), so
  // the governor re-applies exactly those absolute caps: legitimate context that was sent before is
  // never dropped for budget reasons here. Governance (isolation, dedup, injection) is what changes.
  const sentChars = (texts: readonly string[]): number => texts.reduce((sum, text) => sum + text.trim().length, 0);
  const knowledgeCap = Math.max(knowledgeBudget, sentChars((application?.sources ?? []).map(source => source.text)));
  const memoryCap = Math.max(memoryBudget, sentChars(assembly.memorySources.map(source => source.content)));
  const bundle = selectContext([...candidatesFromModelContextAssembly(assembly, input.projectId, now), ...runtimeCandidates], {
    projectId: input.projectId,
    taskId: input.taskId,
    query: input.query,
    budgetChars: knowledgeCap + memoryCap + 2 * RUNTIME_STATE_BUDGET,
    maxCharsByKind: { PROJECT_KNOWLEDGE: knowledgeCap, MEMORY: memoryCap, TASK_STATE: RUNTIME_STATE_BUDGET, PERMISSION_STATE: RUNTIME_STATE_BUDGET },
    admitFirstOfKind: true,
  });

  const kept = new Map(bundle.items.map(item => [key(item.evidence.kind, item.evidence.id), item]));
  const knowledgeSources = (application?.sources ?? [])
    .filter(source => kept.has(key('PROJECT_KNOWLEDGE', source.id)))
    .map(source => (kept.get(key('PROJECT_KNOWLEDGE', source.id))?.injectionFlagged ? { ...source, trust: 'QUARANTINED' as const } : source));
  // Memory has no quarantine trust label, and relabelling a flagged item as SYSTEM_DERIVED would make
  // injected text look system-originated. Flagged memory is therefore withheld from the model entirely.
  const memorySources = (assembly.memoryContext?.sources ?? [])
    .filter(source => kept.has(key('MEMORY', source.id)) && !kept.get(key('MEMORY', source.id))?.injectionFlagged);
  const runtimeItems = bundle.items.filter(item => item.evidence.kind === 'TASK_STATE' || item.evidence.kind === 'PERMISSION_STATE');

  return {
    applicationContext: application && knowledgeSources.length ? { ...application, sources: knowledgeSources } : undefined,
    memoryContext: assembly.memoryContext && memorySources.length ? { ...assembly.memoryContext, sources: memorySources } : undefined,
    runtimeContext: runtimeItems.length ? serializeUnifiedContext({ ...bundle, items: runtimeItems }) : undefined,
    bundle,
  };
}
