import type { MioProject } from '../types/project';
import type { ProjectKnowledgeContext, ProjectKnowledgeHit } from './ProjectKnowledgeIndex';
import { KnowledgeLineage } from './KnowledgeLineage';

export interface KnowledgeQuerySourceDiagnostic {
  assetId: string;
  assetName: string;
  selected: boolean;
  finalScore: number;
  lexicalScore: number;
  trustAdjustment: number;
  freshnessAdjustment: number;
  priorityAdjustment: number;
  lineageFamilyKeys: string[];
  sameLineageAsSelectedPeer: boolean;
  explanation: string[];
}

export interface KnowledgeQueryDiagnosticSummary {
  query: string;
  selectedSourceCount: number;
  independentLineageCount: number;
  lineageDiversity: 'NONE' | 'SINGLE_LINEAGE' | 'MULTI_LINEAGE';
  method: 'TRANSPARENT_RETRIEVAL_DIAGNOSTIC';
  sources: KnowledgeQuerySourceDiagnostic[];
}

function explanation(hit: ProjectKnowledgeHit): string[] {
  const reasons = [`lexical relevance ${hit.lexicalScore.toFixed(2)}`];
  if (hit.trustAdjustment > 0) reasons.push(`verified trust +${hit.trustAdjustment.toFixed(2)}`);
  if (hit.freshnessAdjustment < 0) reasons.push(`stale freshness ${hit.freshnessAdjustment.toFixed(2)}`);
  if (hit.priorityAdjustment > 0) reasons.push(`primary priority +${hit.priorityAdjustment.toFixed(2)}`);
  if (hit.priorityAdjustment < 0) reasons.push(`low priority ${hit.priorityAdjustment.toFixed(2)}`);
  return reasons;
}

export class KnowledgeQueryDiagnostics {
  public static evaluate(project: MioProject, context: ProjectKnowledgeContext): KnowledgeQueryDiagnosticSummary {
    const selectedAssetIds = [...new Set(context.hits.map((hit) => hit.assetId))];
    const independentLineageCount = KnowledgeLineage.independentFamilyCount(project, selectedAssetIds);
    const lineageDiversity: KnowledgeQueryDiagnosticSummary['lineageDiversity'] = selectedAssetIds.length === 0
      ? 'NONE'
      : independentLineageCount <= 1 ? 'SINGLE_LINEAGE' : 'MULTI_LINEAGE';

    const sources = context.hits.map((hit): KnowledgeQuerySourceDiagnostic => {
      const sameLineageAsSelectedPeer = selectedAssetIds.some((assetId) => assetId !== hit.assetId && KnowledgeLineage.shareFamily(project, hit.assetId, assetId));
      return {
        assetId: hit.assetId,
        assetName: hit.assetName,
        selected: true,
        finalScore: hit.score,
        lexicalScore: hit.lexicalScore,
        trustAdjustment: hit.trustAdjustment,
        freshnessAdjustment: hit.freshnessAdjustment,
        priorityAdjustment: hit.priorityAdjustment,
        lineageFamilyKeys: hit.lineageFamilyKeys,
        sameLineageAsSelectedPeer,
        explanation: explanation(hit),
      };
    });

    return {
      query: context.query,
      selectedSourceCount: selectedAssetIds.length,
      independentLineageCount,
      lineageDiversity,
      method: 'TRANSPARENT_RETRIEVAL_DIAGNOSTIC',
      sources,
    };
  }
}
