import { validateOrganizationManifest,type OrganizationManifest,type OrganizationRecommendation } from './SmartOrganizer';
export type OrganizationConflictKind='DUPLICATE_RECOMMENDATION_ID'|'ASSET_MULTIPLE_RENAMES'|'ASSET_MULTIPLE_MOVES'|'TARGET_COLLISION';
export interface OrganizationConflict{kind:OrganizationConflictKind;recommendationIds:string[];assetIds:string[];target?:string;}
export interface OrganizationPreview{manifest:OrganizationManifest;conflicts:OrganizationConflict[];readyForApproval:boolean;execute:false;}
export function previewOrganizationManifest(m:OrganizationManifest):OrganizationPreview{
 validateOrganizationManifest(m);const conflicts:OrganizationConflict[]=[];const byAssetKind=new Map<string,OrganizationRecommendation[]>(),targets=new Map<string,OrganizationRecommendation[]>();
 for(const r of m.recommendations){for(const a of r.assetIds){const k=`${a}:${r.kind}`;byAssetKind.set(k,[...(byAssetKind.get(k)??[]),r]);}if(r.target){const k=`${r.kind}:${r.target.toLocaleLowerCase()}`;targets.set(k,[...(targets.get(k)??[]),r]);}}
 for(const [k,rs] of byAssetKind)if(rs.length>1&&(k.endsWith(':RECOMMEND_RENAME')||k.endsWith(':RECOMMEND_MOVE')))conflicts.push({kind:k.endsWith('RECOMMEND_RENAME')?'ASSET_MULTIPLE_RENAMES':'ASSET_MULTIPLE_MOVES',recommendationIds:rs.map(r=>r.id).sort(),assetIds:[k.split(':')[0]]});
 for(const rs of targets.values())if(rs.length>1&&rs[0].kind==='RECOMMEND_RENAME')conflicts.push({kind:'TARGET_COLLISION',recommendationIds:rs.map(r=>r.id).sort(),assetIds:[...new Set(rs.flatMap(r=>r.assetIds))].sort(),target:rs[0].target});
 return {manifest:m,conflicts,readyForApproval:conflicts.length===0,execute:false};
}
