import type { SemanticClaim } from './SemanticProfile';
const normalize=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function normalizeSemanticClaims(claims:readonly SemanticClaim[],kind:'TAG'|'TOPIC'):SemanticClaim[]{
 const chosen=new Map<string,SemanticClaim>();
 for(const c of claims){if(c.kind!==kind)continue;const value=normalize(c.value);if(!value)continue;const normalized={...c,value};const old=chosen.get(value);if(!old||normalized.confidence>old.confidence||(normalized.confidence===old.confidence&&normalized.id.localeCompare(old.id)<0))chosen.set(value,normalized);}
 return [...chosen.values()].sort((a,b)=>b.confidence-a.confidence||a.value.localeCompare(b.value)||a.id.localeCompare(b.id));
}
