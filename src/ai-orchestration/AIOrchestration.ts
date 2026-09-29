import { authorizeRemoteProcessing, type RemoteProcessingPolicy } from '../security/RemoteProcessingPolicy';
export type AIWorkload='TEXT'|'VISION'|'OCR'|'SPEECH_TO_TEXT'|'AUDIO'|'EMBEDDING'|'MULTIMODAL';
export type AIProviderLocality='LOCAL'|'REMOTE';
export interface AIModelRoute{providerId:string;modelId:string;locality:AIProviderLocality;capabilities:AIWorkload[];enabled:boolean;estimatedInputCostPerMillion?:number;estimatedOutputCostPerMillion?:number;}
export interface AIOrchestrationRequest{id:string;workload:AIWorkload;privacy:'LOCAL_ONLY'|'REMOTE_ALLOWED';estimatedInputUnits:number;estimatedOutputUnits?:number;maxCostUsd:number;preferredProviderIds?:string[];}
export interface AIRouteDecision{requestId:string;route:AIModelRoute;estimatedCostUsd:number;reason:string;fallbacks:AIModelRoute[];}
const supports=(r:AIModelRoute,w:AIWorkload)=>r.enabled&&r.capabilities.includes(w);
export function estimateRouteCost(r:AIModelRoute,input:number,output=0):number{return ((r.estimatedInputCostPerMillion??0)*input+(r.estimatedOutputCostPerMillion??0)*output)/1_000_000;}
export function selectAIRoute(request:AIOrchestrationRequest,routes:readonly AIModelRoute[],remotePolicy?:RemoteProcessingPolicy):AIRouteDecision{
 const candidates=routes.filter(r=>supports(r,request.workload)&&!(request.privacy==='LOCAL_ONLY'&&r.locality!=='LOCAL')&&(r.locality!=='REMOTE'||authorizeRemoteProcessing({privacy:request.privacy,sensitive:false},remotePolicy??{remoteEnabled:false,explicitConsent:false,allowSensitiveContent:false}).allowed)).map(route=>({route,cost:estimateRouteCost(route,request.estimatedInputUnits,request.estimatedOutputUnits)})).filter(x=>x.cost<=request.maxCostUsd);
 if(!candidates.length)throw new Error('No enabled AI route satisfies capability, privacy, and cost budget');
 const preferred=new Set(request.preferredProviderIds??[]);candidates.sort((a,b)=>Number(preferred.has(b.route.providerId))-Number(preferred.has(a.route.providerId))||Number(a.route.locality!=='LOCAL')-Number(b.route.locality!=='LOCAL')||a.cost-b.cost||a.route.providerId.localeCompare(b.route.providerId)||a.route.modelId.localeCompare(b.route.modelId));
 const [chosen,...rest]=candidates;return {requestId:request.id,route:chosen.route,estimatedCostUsd:chosen.cost,reason:chosen.route.locality==='LOCAL'?'eligible local route selected':'eligible remote route selected within explicit budget',fallbacks:rest.map(x=>x.route)};
}
