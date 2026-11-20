/** Isolated read-only local orchestration. Classification is heuristic, not learned reasoning. */
import { MioCoreLocalModelAdapter } from './MioCoreLocalModelAdapter';
import { MioIntelligenceLifecycle } from '../../core/MioIntelligenceLifecycle';
export type CognitiveWorkload='CHAT'|'ANALYSIS'|'CODE'|'CREATIVE';
export interface LocalModelProfile {model:string;workloads:readonly CognitiveWorkload[];}
const kinds:CognitiveWorkload[]=['CHAT','ANALYSIS','CODE','CREATIVE'];
const modelPattern=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/;
export function classifyCognitiveRequest(prompt:string):CognitiveWorkload {
 if(/\b(code|coding|debug|typescript|python|javascript|programming|kode|pemrograman)\b/i.test(prompt))return 'CODE';
 if(/\b(analy[sz]e|analysis|compare|evaluate|analisis|evaluasi|bandingkan|hitung)\b/i.test(prompt))return 'ANALYSIS';
 if(/\b(story|poem|creative|cerita|puisi|kreatif|skenario)\b/i.test(prompt))return 'CREATIVE';
 return 'CHAT';
}
export class MioCognitiveOrchestrator {
 private readonly core:MioIntelligenceLifecycle;
 private readonly profiles:LocalModelProfile[];
 constructor(profiles:readonly LocalModelProfile[]=[{model:'qwen2.5:3b',workloads:kinds}],private readonly transport:typeof fetch=fetch){
  if(!Array.isArray(profiles)||profiles.length<1||profiles.length>8||new Set(profiles.map(p=>p.model)).size!==profiles.length||
   profiles.some(p=>typeof p.model!=='string'||!modelPattern.test(p.model)||!Array.isArray(p.workloads)||!p.workloads.length||p.workloads.some(w=>!kinds.includes(w))))throw Error('MIO_COGNITIVE_PROFILE_INVALID');
  this.profiles=profiles.map(p=>({model:p.model,workloads:[...p.workloads]}));
  this.core=new MioIntelligenceLifecycle(1);
 }
 async generate(prompt:string,timeoutMs=120000,workload?:CognitiveWorkload){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>32000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||(workload!==undefined&&!kinds.includes(workload)))throw Error('MIO_COGNITIVE_REQUEST_INVALID');
  const task=this.core.begin(), started=performance.now(), selected=workload??classifyCognitiveRequest(prompt);
  const remaining=()=>{const ms=Math.floor(timeoutMs-(performance.now()-started));if(task.signal.aborted||ms<1)throw Error('MIO_COGNITIVE_CANCELLED_OR_TIMEOUT');return ms;};
  try{
   for(const profile of this.profiles.filter(p=>p.workloads.includes(selected))){
    const adapter=new MioCoreLocalModelAdapter(profile.model,this.transport);
    const abort=()=>adapter.dispose();
    task.signal.addEventListener('abort',abort,{once:true});
    try{
     remaining();
     const ready=await adapter.readiness(Math.min(8000,remaining()));
     if(!ready.ready)continue;
     const response=await adapter.generate(prompt,remaining());
     if(!this.core.finish(task.token))throw Error('MIO_COGNITIVE_RESULT_DENIED');
     return {...response,workload:selected,selection:'FIRST_READY_CONFIGURED_LOCAL_MODEL' as const};
    }finally{task.signal.removeEventListener('abort',abort);adapter.dispose();}
   }
   throw Error('MIO_COGNITIVE_NO_READY_MODEL');
  }finally{this.core.finish(task.token);}
 }
 dispose(){this.core.dispose();}
}
