import type { SemanticClaim } from './SemanticProfile';
export type SemanticEntityType='PERSON'|'ORGANIZATION'|'LOCATION'|'PRODUCT'|'DATE'|'OTHER';
export interface SemanticEntity{name:string;type:SemanticEntityType;confidence:number;claimIds:string[];}
export function collectSemanticEntities(claims:readonly SemanticClaim[]):SemanticEntity[]{
 const groups=new Map<string,SemanticClaim[]>();
 for(const c of claims){if(c.kind!=='ENTITY')continue;const raw=c.value.normalize('NFKC').trim();if(!raw)continue;const split=raw.match(/^([A-Z_]+):(.*)$/);const type=(split?.[1]??'OTHER') as SemanticEntityType;const name=(split?.[2]??raw).trim();const valid:SemanticEntityType[]=['PERSON','ORGANIZATION','LOCATION','PRODUCT','DATE','OTHER'];const safeType=valid.includes(type)?type:'OTHER';const key=`${safeType}:${name.toLocaleLowerCase()}`;groups.set(key,[...(groups.get(key)??[]),c]);}
 return [...groups.entries()].map(([key,g])=>{const i=key.indexOf(':');return {type:key.slice(0,i) as SemanticEntityType,name:g[0].value.includes(':')?g[0].value.slice(g[0].value.indexOf(':')+1).trim():g[0].value.trim(),confidence:Math.max(...g.map(x=>x.confidence)),claimIds:g.map(x=>x.id).sort()};}).sort((a,b)=>b.confidence-a.confidence||a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
}
