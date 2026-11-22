/** Opt-in local Ollama repeatability run: 3 independent 3-turn sessions, no automatic approval. */
import * as os from 'node:os';
import { NativeDesktopChatService } from '../../electron/ipc/nativeLocalChat';
import { summarizeLocalBenchmark, type LocalBenchmarkSample } from '../../electron/ipc/nativeLocalBenchmark';
import { assessLocalBenchmarkRepeatability } from '../../src/intelligence/model/MioLocalBenchmarkRepeatability';
import { checkNativeRuntimePreflight } from '../../electron/ipc/nativeRuntimePreflight';
import type { ModelMessage } from '../../src/types/models';
async function main(){
 if(process.env.MIO_LIVE_OLLAMA!=='1'){
  console.error('NOT_RUN: set MIO_LIVE_OLLAMA=1 to explicitly run nine local Ollama turns.');
  process.exitCode=2;return;
 }
 const preflight=await checkNativeRuntimePreflight();
 if(!preflight.ready){console.error(JSON.stringify({status:'PREFLIGHT_DENIED',reason:preflight.status}));process.exitCode=2;return;}
 const summaries=[];
 const questions=['Jawab dengan satu kata: siap.','Sebutkan satu manfaat AI lokal.','Jelaskan arti privasi data dalam satu kalimat.'];
 for(let round=0;round<3;round++){
  const service=new NativeDesktopChatService();
  const messages:ModelMessage[]=[{role:'system',content:'Jawab singkat dalam bahasa Indonesia. Jangan gunakan alat eksternal.'}];
  const samples:LocalBenchmarkSample[]=[];
  try{
   for(const question of questions){
    messages.push({role:'user',content:question});
    const freeBeforeBytes=os.freemem(),processRssBeforeBytes=process.memoryUsage().rss;
    const start=performance.now();
    const response=await service.chat({messages});
    samples.push({elapsedMs:Math.max(0,Math.round(performance.now()-start)),
     freeBeforeBytes,freeAfterBytes:os.freemem(),processRssBeforeBytes,
     processRssAfterBytes:process.memoryUsage().rss,
     success:response.success&&response.model==='qwen2.5:3b'&&response.source==='LOCAL_ENDPOINT'});
    if(!samples.at(-1)?.success){process.exitCode=1;break;}
    messages.push({role:'assistant',content:response.text!});
   }
  }finally{service.stop();}
  if(samples.length!==3){console.error(JSON.stringify({stage:'M-2.02h',status:'INCOMPLETE_LOCAL_RUN',round:round+1}));return;}
  summaries.push(summarizeLocalBenchmark(samples));
  if(process.exitCode===1)break;
 }
 if(summaries.length!==3){console.error(JSON.stringify({stage:'M-2.02h',status:'INCOMPLETE_REPEATED_BENCHMARK'}));return;}
 const assessment=assessLocalBenchmarkRepeatability(summaries,120000);
 console.log(JSON.stringify({stage:'M-2.02h',mode:'LIVE_LOCAL_OLLAMA',model:'qwen2.5:3b',
  runs:summaries,repeatability:assessment,localOnly:true,
  ramRequirement:'NOT_DETERMINED',operatorApprovalRequired:true,
  GPU:'NOT_MEASURED',windowsCheckpointDurability:'NOT_TESTED'},null,2));
 if(assessment.verdict!=='READY_FOR_HUMAN_REVIEW')process.exitCode=1;
}
main().catch(e=>{console.error('MIO_REPEATABILITY_FAILED:',e instanceof Error?e.message:'UNKNOWN');process.exitCode=1;});
