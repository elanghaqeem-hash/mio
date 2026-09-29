import type { AIModelRoute,AIOrchestrationRequest } from './AIOrchestration';
export interface AIAdapterRequest{request:AIOrchestrationRequest;route:AIModelRoute;payload:unknown;}
export interface AIAdapterUsage{inputUnits?:number;outputUnits?:number;actualCostUsd?:number;}
export interface AIAdapterResult<T=unknown>{value:T;usage?:AIAdapterUsage;providerRequestId?:string;}
export interface AIProviderAdapter{id:string;listRoutes():readonly AIModelRoute[];execute<T=unknown>(request:AIAdapterRequest):Promise<AIAdapterResult<T>>;}
export class AIProviderRegistry{private readonly adapters=new Map<string,AIProviderAdapter>();register(adapter:AIProviderAdapter){if(this.adapters.has(adapter.id))throw new Error(`AI provider already registered: ${adapter.id}`);this.adapters.set(adapter.id,adapter);}get(id:string){return this.adapters.get(id);}routes(){return [...this.adapters.values()].flatMap(a=>[...a.listRoutes()]);}}
