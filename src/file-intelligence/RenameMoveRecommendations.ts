import type { OrganizationRecommendation } from './SmartOrganizer';
const safeName=(s:string)=>s.normalize('NFKC').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').slice(0,180);
export function recommendRename(assetId:string,currentName:string,proposedBase:string,extension=''):OrganizationRecommendation{
 const base=safeName(proposedBase);if(!assetId.trim()||!base)throw new Error('Rename recommendation requires asset and safe proposed name');const ext=extension.replace(/^\./,'').replace(/[^a-zA-Z0-9]+/g,'').slice(0,16);const target=ext?`${base}.${ext}`:base;if(target===currentName)throw new Error('Rename recommendation must change the name');
 return {id:`rename:${assetId}`,assetIds:[assetId],kind:'RECOMMEND_RENAME',target,confidence:.7,source:'SEMANTIC',evidenceIds:[`current-name:${currentName}`],requiresApproval:true,execute:false};
}
export function recommendMove(assetId:string,targetFolder:string,evidenceId:string,confidence=.7):OrganizationRecommendation{
 const target=targetFolder.normalize('NFKC').trim().replace(/^[/\\]+|[/\\]+$/g,'');if(!assetId.trim()||!target||target.includes('..')||!evidenceId.trim())throw new Error('Move recommendation target/evidence is unsafe');
 return {id:`move:${assetId}`,assetIds:[assetId],kind:'RECOMMEND_MOVE',target,confidence:Math.max(0,Math.min(1,confidence)),source:'RULE',evidenceIds:[evidenceId],requiresApproval:true,execute:false};
}
