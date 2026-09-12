import type { KnowledgeFreshness, KnowledgeSourcePriority, MioProject, ProjectAsset } from '../types/project';

export type KnowledgeConflictReason = 'NUMERIC_MISMATCH' | 'POLARITY_MISMATCH';

export interface KnowledgePotentialConflict {
  leftAssetId: string;
  rightAssetId: string;
  sharedTerms: string[];
  reason: KnowledgeConflictReason;
  leftSignal: string;
  rightSignal: string;
}

export interface KnowledgeHealthSummary {
  activeSources: number;
  verifiedSources: number;
  currentSources: number;
  primarySources: number;
  reviewRequiredSources: number;
  potentialConflicts: KnowledgePotentialConflict[];
  healthScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  method: 'BOUNDED_GOVERNANCE_HEURISTIC';
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'yang', 'dan', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'adalah', 'atau']);
const NEGATION = new Set(['not', 'no', 'never', 'without', 'tidak', 'bukan', 'jangan', 'tanpa']);

function freshness(freshUntil?: number): KnowledgeFreshness {
  if (!freshUntil) return 'UNKNOWN';
  return freshUntil >= Date.now() ? 'CURRENT' : 'STALE';
}

function priority(project: MioProject, assetId: string): KnowledgeSourcePriority {
  return project.knowledgeGovernance.sources[assetId]?.priority ?? 'STANDARD';
}

function activeDocuments(project: MioProject): ProjectAsset[] {
  return project.assets.filter((asset) => {
    if (asset.type !== 'document' || typeof asset.data?.content !== 'string' || !asset.data.content.trim()) return false;
    const record = project.knowledgeGovernance.sources[asset.id];
    return record?.included !== false && !record?.supersededByAssetId;
  });
}

function terms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])].filter((term) => !STOP_WORDS.has(term) && !NEGATION.has(term));
}

function numbers(text: string): string[] {
  return [...new Set(text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [])];
}

function hasNegation(text: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return tokens.some((token) => NEGATION.has(token));
}

function boundedSignal(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function detectPotentialConflicts(project: MioProject, documents: ProjectAsset[]): KnowledgePotentialConflict[] {
  const conflicts: KnowledgePotentialConflict[] = [];
  for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < documents.length; rightIndex += 1) {
      const left = documents[leftIndex];
      const right = documents[rightIndex];
      const leftText = String(left.data.content);
      const rightText = String(right.data.content);
      const leftTerms = new Set(terms(leftText));
      const sharedTerms = terms(rightText).filter((term) => leftTerms.has(term)).slice(0, 8);
      if (sharedTerms.length < 2) continue;

      const leftNumbers = numbers(leftText);
      const rightNumbers = numbers(rightText);
      const differingNumericSignals = leftNumbers.length > 0 && rightNumbers.length > 0 && leftNumbers.every((value) => !rightNumbers.includes(value)) && rightNumbers.every((value) => !leftNumbers.includes(value));
      if (differingNumericSignals) {
        conflicts.push({
          leftAssetId: left.id,
          rightAssetId: right.id,
          sharedTerms,
          reason: 'NUMERIC_MISMATCH',
          leftSignal: boundedSignal(leftText),
          rightSignal: boundedSignal(rightText),
        });
        continue;
      }

      if (hasNegation(leftText) !== hasNegation(rightText) && sharedTerms.length >= 3) {
        conflicts.push({
          leftAssetId: left.id,
          rightAssetId: right.id,
          sharedTerms,
          reason: 'POLARITY_MISMATCH',
          leftSignal: boundedSignal(leftText),
          rightSignal: boundedSignal(rightText),
        });
      }
    }
  }
  return conflicts.slice(0, 20);
}

export class KnowledgeHealth {
  public static evaluate(project: MioProject): KnowledgeHealthSummary {
    const documents = activeDocuments(project);
    const verifiedSources = documents.filter((asset) => project.knowledgeGovernance.sources[asset.id]?.trust === 'VERIFIED').length;
    const currentSources = documents.filter((asset) => freshness(project.knowledgeGovernance.sources[asset.id]?.freshUntil) === 'CURRENT').length;
    const primarySources = documents.filter((asset) => priority(project, asset.id) === 'PRIMARY').length;
    const reviewRequiredSources = documents.filter((asset) => {
      const record = project.knowledgeGovernance.sources[asset.id];
      return record?.trust !== 'VERIFIED' || freshness(record?.freshUntil) !== 'CURRENT';
    }).length;
    const potentialConflicts = detectPotentialConflicts(project, documents);

    if (documents.length === 0) {
      return { activeSources: 0, verifiedSources: 0, currentSources: 0, primarySources: 0, reviewRequiredSources: 0, potentialConflicts: [], healthScore: 0, confidence: 'LOW', method: 'BOUNDED_GOVERNANCE_HEURISTIC' };
    }

    const verifiedRatio = verifiedSources / documents.length;
    const currentRatio = currentSources / documents.length;
    const reviewPenalty = reviewRequiredSources / documents.length;
    const conflictPenalty = Math.min(potentialConflicts.length / documents.length, 1);
    const rawScore = 45 * verifiedRatio + 35 * currentRatio + 20 * (1 - reviewPenalty) - 20 * conflictPenalty;
    const healthScore = Math.max(0, Math.min(100, Math.round(rawScore)));
    const confidence: KnowledgeHealthSummary['confidence'] = healthScore >= 80 ? 'HIGH' : healthScore >= 55 ? 'MEDIUM' : 'LOW';

    return {
      activeSources: documents.length,
      verifiedSources,
      currentSources,
      primarySources,
      reviewRequiredSources,
      potentialConflicts,
      healthScore,
      confidence,
      method: 'BOUNDED_GOVERNANCE_HEURISTIC',
    };
  }
}
