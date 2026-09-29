export type CircuitState='CLOSED'|'OPEN'|'HALF_OPEN';
export class AIProviderCircuitBreaker{private failures=0;private openedAt?:number;constructor(private readonly threshold=3,private readonly cooldownMs=30_000){}
 state(now=Date.now()):CircuitState{if(this.openedAt===undefined)return 'CLOSED';return now-this.openedAt>=this.cooldownMs?'HALF_OPEN':'OPEN';}
 canAttempt(now=Date.now()){return this.state(now)!=='OPEN';}
 success(){this.failures=0;this.openedAt=undefined;}
 failure(now=Date.now()){this.failures++;if(this.failures>=this.threshold)this.openedAt=now;}
}
export async function executeWithBoundedFallback<T>(routes:readonly string[],execute:(route:string)=>Promise<T>,circuits:Map<string,AIProviderCircuitBreaker>,maxAttempts=3):Promise<{value:T;route:string;attempts:number}>{
 let attempts=0,last:unknown;for(const route of routes.slice(0,Math.max(1,maxAttempts))){const circuit=circuits.get(route)??new AIProviderCircuitBreaker();circuits.set(route,circuit);if(!circuit.canAttempt())continue;attempts++;try{const value=await execute(route);circuit.success();return {value,route,attempts};}catch(e){last=e;circuit.failure();}}
 throw last instanceof Error?last:new Error('All eligible AI routes failed or circuits are open');
}