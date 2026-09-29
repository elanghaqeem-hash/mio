export type SmartSearchMode='FILENAME'|'METADATA'|'FULL_TEXT'|'SEMANTIC'|'CROSS_MODAL';
export interface SmartSearchQuery{text:string;modes:SmartSearchMode[];limit?:number;minimumScore?:number;}
export interface SmartSearchEvidence{mode:SmartSearchMode;locator:string;snippet?:string;source:string;}
export interface SmartSearchResult{assetId:string;score:number;evidence:SmartSearchEvidence[];}
export function validateSmartSearchQuery(q:SmartSearchQuery):Required<SmartSearchQuery>{
 const text=q.text.normalize('NFKC').trim();if(!text||text.length>1000)throw new Error('Search text must contain 1..1000 characters');
 const modes=[...new Set(q.modes)];if(!modes.length)throw new Error('At least one search mode is required');
 const limit=q.limit??50,minimumScore=q.minimumScore??0;if(!Number.isSafeInteger(limit)||limit<1||limit>500||!Number.isFinite(minimumScore)||minimumScore<0||minimumScore>1)throw new Error('Search bounds are invalid');
 return {text,modes,limit,minimumScore};
}
