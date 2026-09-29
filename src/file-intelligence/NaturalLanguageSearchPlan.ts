import type { SmartSearchMode,SmartSearchQuery } from './SmartSearch';
export interface NaturalLanguageSearchPlan{originalText:string;searchText:string;modes:SmartSearchMode[];filters:{modality?:string;project?:string;client?:string};limit:number;minimumScore:number;plannerSource:'RULES'|'LOCAL_MODEL'|'EXTERNAL_MODEL';modelId?:string;externalProcessing:boolean;}
export function validateNaturalLanguageSearchPlan(p:NaturalLanguageSearchPlan):NaturalLanguageSearchPlan{
 const originalText=p.originalText.normalize('NFKC').trim(),searchText=p.searchText.normalize('NFKC').trim();if(!originalText||originalText.length>2000||!searchText||searchText.length>1000)throw new Error('Natural-language search plan text is invalid');
 if(!p.modes.length||p.limit<1||p.limit>500||!Number.isSafeInteger(p.limit)||!Number.isFinite(p.minimumScore)||p.minimumScore<0||p.minimumScore>1)throw new Error('Natural-language search plan bounds are invalid');
 if(p.externalProcessing!==(p.plannerSource==='EXTERNAL_MODEL'))throw new Error('Planner external-processing provenance conflicts with source');
 if((p.plannerSource==='LOCAL_MODEL'||p.plannerSource==='EXTERNAL_MODEL')&&!p.modelId?.trim())throw new Error('Model-backed planner requires modelId');
 return {...p,originalText,searchText,modes:[...new Set(p.modes)]};
}
export function planToSmartSearchQuery(p:NaturalLanguageSearchPlan):SmartSearchQuery{const v=validateNaturalLanguageSearchPlan(p);return {text:v.searchText,modes:v.modes,limit:v.limit,minimumScore:v.minimumScore};}
