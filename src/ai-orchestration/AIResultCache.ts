export interface AICacheEntry<T>{key:string;value:T;createdAt:number;expiresAt:number;provenanceId:string;}
export class AIResultCache{private readonly values=new Map<string,AICacheEntry<unknown>>();static key(parts:readonly string[]):string{return parts.map(x=>x.normalize('NFKC')).join('::');}
 put<T>(key:string,value:T,ttlMs:number,provenanceId:string,now=Date.now()){if(ttlMs<=0)throw new Error('Cache TTL must be positive');this.values.set(key,{key,value,createdAt:now,expiresAt:now+ttlMs,provenanceId});}
 get<T>(key:string,now=Date.now()):AICacheEntry<T>|undefined{const v=this.values.get(key);if(!v)return; if(v.expiresAt<=now){this.values.delete(key);return;}return v as AICacheEntry<T>;}
 clear(){this.values.clear();}
}