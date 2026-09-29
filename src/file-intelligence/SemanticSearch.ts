import { compareSemanticEmbeddings } from './CrossModalSimilarity';
import type { SemanticEmbedding } from './SemanticEmbedding';
import type { SmartSearchResult } from './SmartSearch';
export function semanticEmbeddingSearch(query:SemanticEmbedding,candidates:readonly SemanticEmbedding[],limit=50,minimumScore=0):SmartSearchResult[]{
 const out:SmartSearchResult[]=[];for(const c of candidates){if(c.assetId===query.assetId||c.modelId!==query.modelId||c.dimensions!==query.dimensions)continue;const s=compareSemanticEmbeddings(query,c);if(s.score<minimumScore)continue;out.push({assetId:c.assetId,score:s.score,evidence:[{mode:query.modality===c.modality?'SEMANTIC':'CROSS_MODAL',locator:`embedding:${s.modelId}`,source:s.algorithm}]});}
 return out.sort((a,b)=>b.score-a.score||a.assetId.localeCompare(b.assetId)).slice(0,Math.min(500,Math.max(1,limit)));
}
