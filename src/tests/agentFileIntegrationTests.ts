import { planAgentFileAction } from '../agent/FileIntelligenceAgentBridge';
export async function runAgentFileIntegrationTests(){let passed=0;const check=(x:boolean)=>{if(!x)throw new Error('Agent file integration assertion failed');passed++;};
 const s=planAgentFileAction({action:'SEARCH',query:{text:'  report  ',modes:['FILENAME'],limit:10}});check(s.status==='READY'&&s.mutationExecuted===false);
 const u=planAgentFileAction({action:'AI_ROUTE',request:{id:'r',workload:'TEXT',privacy:'LOCAL_ONLY',estimatedInputUnits:1,maxCostUsd:0}});check(u.status==='UNAVAILABLE');
 let denied=false;try{planAgentFileAction({action:'ORGANIZE_PREVIEW',manifest:{id:'m',generatedBy:'mio-smart-organizer-v1',mutationAllowed:true as false,recommendations:[]}});}catch{denied=true;}check(denied);
 const route=planAgentFileAction({action:'AI_ROUTE',request:{id:'r',workload:'TEXT',privacy:'LOCAL_ONLY',estimatedInputUnits:1,maxCostUsd:1}}, {routes:[{providerId:'remote',modelId:'m',locality:'REMOTE',capabilities:['TEXT'],enabled:true}]});check(route.status==='UNAVAILABLE'||route.mutationExecuted===false);
 return {name:'Agent File Integration',passed,total:4};}