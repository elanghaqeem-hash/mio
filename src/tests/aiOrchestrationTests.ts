import { selectAIRoute } from '../ai-orchestration/AIOrchestration';import { AICostLedger } from '../ai-orchestration/AICostLedger';import { AIResultCache } from '../ai-orchestration/AIResultCache';import { AIProviderCircuitBreaker,executeWithBoundedFallback } from '../ai-orchestration/AIFallback';import { AIProviderRegistry } from '../ai-orchestration/AIProviderAdapter';
export async function runAIOrchestrationTests(){let passed=0;const total=7;const ok=(v:boolean)=>{if(!v)throw new Error('AI orchestration assertion failed');passed++;};
 const routes=[{providerId:'local',modelId:'l',locality:'LOCAL' as const,capabilities:['VISION' as const],enabled:true},{providerId:'remote',modelId:'r',locality:'REMOTE' as const,capabilities:['VISION' as const],enabled:true,estimatedInputCostPerMillion:1}];
 ok(selectAIRoute({id:'1',workload:'VISION',privacy:'LOCAL_ONLY',estimatedInputUnits:100,maxCostUsd:1},routes).route.providerId==='local');
 let denied=false;try{selectAIRoute({id:'2',workload:'OCR',privacy:'LOCAL_ONLY',estimatedInputUnits:1,maxCostUsd:0},routes);}catch{denied=true;}ok(denied);
 const ledger=new AICostLedger(1);ledger.reserve(.4);ok(Math.abs(ledger.snapshot().remainingUsd-.6)<1e-9);ledger.settle(.4,.3);ok(Math.abs(ledger.snapshot().spentUsd-.3)<1e-9);
 const cache=new AIResultCache();cache.put('k','v',100,'p',0);ok(cache.get<string>('k',50)?.value==='v'&&!cache.get('k',101));
 const circuits=new Map<string,AIProviderCircuitBreaker>();const out=await executeWithBoundedFallback(['a','b'],async r=>{if(r==='a')throw new Error('x');return 'ok';},circuits);ok(out.route==='b'&&out.attempts===2);
 const registry=new AIProviderRegistry();registry.register({id:'x',listRoutes:()=>[],execute:async<T=unknown>()=>({value:'x' as T})});ok(registry.get('x')?.id==='x');
 return {name:'AI Orchestration',passed,total};}
