import { validateMutationTransaction,type MutationOperation,type MutationTransaction } from './SafeMutation';
export interface MutationPreviewEntry{operationId:string;kind:MutationOperation['kind'];source?:string;target?:string;blocked:boolean;reasons:string[];}
export interface MutationPreview{transactionId:string;workspaceId:string;entries:MutationPreviewEntry[];previewDigest:string;readyForApproval:boolean;}
const normalize=(p:string)=>p.normalize('NFKC').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/+/g,'/').replace(/^\/|\/$/g,'');
const safeRelative=(p:string)=>{const n=normalize(p);return !!n&&!n.startsWith('../')&&!n.includes('/../')&&!/^[A-Za-z]:\//.test(n)&&!n.startsWith('/');};
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
export function previewMutationTransaction(t:MutationTransaction):MutationPreview{
 validateMutationTransaction(t);const targets=new Map<string,string[]>();for(const o of t.operations)if(o.target){const n=normalize(o.target).toLocaleLowerCase();targets.set(n,[...(targets.get(n)??[]),o.id]);}
 const entries=t.operations.map(o=>{const reasons:string[]=[];if(o.source&&!safeRelative(o.source))reasons.push('UNSAFE_SOURCE_PATH');if(o.target&&!safeRelative(o.target))reasons.push('UNSAFE_TARGET_PATH');if(o.source&&o.target&&normalize(o.source).toLocaleLowerCase()===normalize(o.target).toLocaleLowerCase())reasons.push('SOURCE_EQUALS_TARGET');if(o.target&&(targets.get(normalize(o.target).toLocaleLowerCase())?.length??0)>1)reasons.push('TARGET_COLLISION_IN_MANIFEST');return {operationId:o.id,kind:o.kind,source:o.source&&normalize(o.source),target:o.target&&normalize(o.target),blocked:reasons.length>0,reasons};});
 const canonical=JSON.stringify(entries);return {transactionId:t.id,workspaceId:t.workspaceId,entries,previewDigest:`fnv1a32:${hash(canonical)}`,readyForApproval:entries.every(e=>!e.blocked)};
}
