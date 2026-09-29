import type { SemanticClaim } from './SemanticProfile';
export interface SemanticAssociation{kind:'PROJECT'|'CLIENT';name:string;confidence:number;claimIds:string[];confirmed:boolean;}
export function buildSemanticAssociations(claims:readonly SemanticClaim[]):SemanticAssociation[]{
 const groups=new Map<string,SemanticClaim[]>();
 for(const c of claims){if(c.kind!=='PROJECT'&&c.kind!=='CLIENT')continue;const name=c.value.normalize('NFKC').trim();if(!name)continue;const key=`${c.kind}:${name.toLocaleLowerCase()}`;groups.set(key,[...(groups.get(key)??[]),c]);}
 return [...groups.values()].map(g=>({kind:g[0].kind as 'PROJECT'|'CLIENT',name:g[0].value.normalize('NFKC').trim(),confidence:Math.max(...g.map(c=>c.confidence)),claimIds:g.map(c=>c.id).sort(),confirmed:g.some(c=>c.source==='USER_CONFIRMED')})).sort((a,b)=>b.confidence-a.confidence||a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
}
