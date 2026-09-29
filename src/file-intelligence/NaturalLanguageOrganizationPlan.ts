import type { OrganizationActionKind,OrganizationEvidenceSource } from './SmartOrganizer';
export interface NaturalLanguageOrganizationPlan{originalText:string;allowedActions:OrganizationActionKind[];scopeAssetIds:string[];plannerSource:'RULES'|'LOCAL_MODEL'|'EXTERNAL_MODEL';modelId?:string;externalProcessing:boolean;source:OrganizationEvidenceSource;requiresApproval:true;execute:false;}
export function validateNaturalLanguageOrganizationPlan(p:NaturalLanguageOrganizationPlan):NaturalLanguageOrganizationPlan{
 const originalText=p.originalText.normalize('NFKC').trim();if(!originalText||originalText.length>2000||!p.allowedActions.length||p.scopeAssetIds.some(x=>!x.trim())||p.requiresApproval!==true||p.execute!==false)throw new Error('Invalid organization plan');
 if(p.externalProcessing!==(p.plannerSource==='EXTERNAL_MODEL'))throw new Error('Planner provenance conflicts with external processing');
 if((p.plannerSource==='LOCAL_MODEL'||p.plannerSource==='EXTERNAL_MODEL')&&!p.modelId?.trim())throw new Error('Model-backed organization planner requires modelId');
 return {...p,originalText,allowedActions:[...new Set(p.allowedActions)],scopeAssetIds:[...new Set(p.scopeAssetIds)]};
}
