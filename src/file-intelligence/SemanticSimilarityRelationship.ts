import type { CrossModalSimilarity } from './CrossModalSimilarity';
import type { AssetGraphEdge } from './AssetRelationshipGraph';
export function semanticSimilarityEdge(id:string,result:CrossModalSimilarity,minimumScore=.5):AssetGraphEdge{
 if(!Number.isFinite(minimumScore)||minimumScore<0||minimumScore>1||result.score<minimumScore)throw new Error('Semantic similarity does not meet graph threshold');
 return {id,from:result.leftAssetId,to:result.rightAssetId,kind:'SEMANTIC_SIMILARITY',directed:false,confidence:result.score,source:'SEMANTIC',evidenceIds:[`embedding-model:${result.modelId}`,`algorithm:${result.algorithm}`]};
}
