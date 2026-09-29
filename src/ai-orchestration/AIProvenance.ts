import { assertNoSecretFields } from '../security/SecretRedaction';
import type { AIModelRoute,AIWorkload } from './AIOrchestration';
export interface AIProvenanceReceipt{schemaVersion:1;id:string;requestId:string;workload:AIWorkload;providerId:string;modelId:string;locality:'LOCAL'|'REMOTE';startedAt:number;finishedAt:number;estimatedCostUsd:number;actualCostUsd?:number;cacheHit:boolean;status:'SUCCEEDED'|'FAILED';error?:string;}
export function createAIProvenanceReceipt(input:Omit<AIProvenanceReceipt,'schemaVersion'>):AIProvenanceReceipt{assertNoSecretFields(input);return {schemaVersion:1,...input};}
export function routeIdentity(route:AIModelRoute):string{return `${route.providerId}/${route.modelId}`;}