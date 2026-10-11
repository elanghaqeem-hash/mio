import { validateSmartSearchQuery, type SmartSearchQuery } from '../file-intelligence/SmartSearch';
import { validateOrganizationManifest, type OrganizationManifest } from '../file-intelligence/SmartOrganizer';
import { selectAIRoute, type AIModelRoute, type AIOrchestrationRequest } from '../ai-orchestration/AIOrchestration';
import type { RemoteProcessingPolicy } from '../security/RemoteProcessingPolicy';
export type AgentFileAction='SEARCH'|'ORGANIZE_PREVIEW'|'AI_ROUTE';
export type AgentFileRequest={action:'SEARCH';query:SmartSearchQuery}|{action:'ORGANIZE_PREVIEW';manifest:OrganizationManifest}|{action:'AI_ROUTE';request:AIOrchestrationRequest};
export type AgentFileResult={action:AgentFileAction;status:'READY'|'UNAVAILABLE';payload:unknown;mutationExecuted:false};
export function planAgentFileAction(input:AgentFileRequest,options?:{routes?:readonly AIModelRoute[];remotePolicy?:RemoteProcessingPolicy}):AgentFileResult{
 switch(input.action){
 case 'SEARCH':return {action:input.action,status:'READY',payload:validateSmartSearchQuery(input.query),mutationExecuted:false};
 case 'ORGANIZE_PREVIEW':return {action:input.action,status:'READY',payload:validateOrganizationManifest(input.manifest),mutationExecuted:false};
 case 'AI_ROUTE':if(!options?.routes?.length)return {action:input.action,status:'UNAVAILABLE',payload:{reason:'No configured AI provider routes'},mutationExecuted:false};return {action:input.action,status:'READY',payload:selectAIRoute(input.request,options.routes,options.remotePolicy),mutationExecuted:false};
 }
}