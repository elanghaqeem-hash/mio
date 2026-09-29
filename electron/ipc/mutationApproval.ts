export type DesktopMutationKind='MKDIR'|'RENAME'|'MOVE'|'COPY'|'TRASH';
export interface DesktopMutationOperation{id:string;kind:DesktopMutationKind;source?:string;target?:string;collisionPolicy:'BLOCK';}
export interface DesktopMutationTransaction{id:string;workspaceId:string;operations:DesktopMutationOperation[];}
export interface DesktopMutationApproval{transactionId:string;workspaceId:string;previewDigest:string;approvedAt:string;approvedBy:'USER';token:string;}
const normalize=(p:string)=>p.normalize('NFKC').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/+/g,'/').replace(/^\/|\/$/g,'');
const safe=(p:string)=>{const n=normalize(p);return !!n&&!n.startsWith('../')&&!n.includes('/../')&&!/^[A-Za-z]:\//.test(n)&&!n.startsWith('/');};
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
export function assertApprovedDesktopMutation(t:DesktopMutationTransaction,a:DesktopMutationApproval,nonce:string):void{
 if(!t.id||!t.workspaceId||!t.operations.length||a.approvedBy!=='USER'||a.transactionId!==t.id||a.workspaceId!==t.workspaceId||nonce.length<16)throw new Error('Invalid mutation approval envelope');
 const targets=new Set<string>();const entries=t.operations.map(o=>{if(o.collisionPolicy!=='BLOCK'||!o.id)throw new Error('Invalid mutation operation');if(o.source&&!safe(o.source))throw new Error('Unsafe mutation source');if(o.target&&!safe(o.target))throw new Error('Unsafe mutation target');const target=o.target&&normalize(o.target).toLocaleLowerCase();if(target&&targets.has(target))throw new Error('Mutation target collision');if(target)targets.add(target);return {operationId:o.id,kind:o.kind,source:o.source&&normalize(o.source),target:o.target&&normalize(o.target),blocked:false,reasons:[]};});
 const digest=`fnv1a32:${hash(JSON.stringify(entries))}`;if(a.previewDigest!==digest)throw new Error('Mutation approval preview digest mismatch');const material=`${t.id}|${t.workspaceId}|${digest}|${nonce}`;if(a.token!==`approval-v1:${hash(material)}`)throw new Error('Mutation approval token mismatch');
}
