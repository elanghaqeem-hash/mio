import type { OrganizationRecommendation } from './SmartOrganizer';
export interface OrganizerAsset{assetId:string;kind:string;extension?:string;project?:string;client?:string;}
const safeSegment=(s:string)=>s.normalize('NFKC').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,120);
export function recommendCategoryFolder(a:OrganizerAsset):OrganizationRecommendation{
 const category=safeSegment(a.kind||'Other');return {id:`folder:${a.assetId}`,assetIds:[a.assetId],kind:'RECOMMEND_FOLDER',target:category,confidence:.75,source:'METADATA',evidenceIds:[`kind:${a.kind}`],requiresApproval:true,execute:false};
}
export function recommendProjectGrouping(a:OrganizerAsset):OrganizationRecommendation|undefined{
 const label=a.project||a.client;if(!label)return;const target=safeSegment(label);if(!target)return;return {id:`group:${a.assetId}`,assetIds:[a.assetId],kind:'RECOMMEND_GROUP',target,confidence:.8,source:'SEMANTIC',evidenceIds:[a.project?`project:${a.project}`:`client:${a.client}`],requiresApproval:true,execute:false};
}
