import type { AssetGraphEdge } from './AssetRelationshipGraph';
import type { OrganizationRecommendation } from './SmartOrganizer';
export function recommendDuplicateReview(edge:AssetGraphEdge):OrganizationRecommendation{
 if(edge.kind!=='EXACT_DUPLICATE'||edge.source!=='HASH'||edge.confidence!==1)throw new Error('Duplicate review requires exact hash-grounded duplicate evidence');
 return {id:`duplicate:${edge.id}`,assetIds:[edge.from,edge.to],kind:'RECOMMEND_DUPLICATE_REVIEW',confidence:1,source:'RELATIONSHIP_GRAPH',evidenceIds:[edge.id,...edge.evidenceIds],requiresApproval:true,execute:false};
}
