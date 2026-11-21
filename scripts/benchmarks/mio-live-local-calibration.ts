/** Explicit opt-in workstation benchmark: Ollama stays local, no profile auto-approval. */
import * as os from 'node:os';
import { NativeDesktopChatService } from '../../electron/ipc/nativeLocalChat';
import { summarizeLocalBenchmark, type LocalBenchmarkSample } from '../../electron/ipc/nativeLocalBenchmark';
import { checkNativeRuntimePreflight } from '../../electron/ipc/nativeRuntimePreflight';
import type { ModelMessage } from '../../src/types/models';

async function main(){
 if(process.env.MIO_LIVE_OLLAMA!=='1'){
  console.error('NOT_RUN: Set MIO_LIVE_OLLAMA=1 to run explicit local benchmark; nothing executed.');
  process.exitCode=2;return;
 }
 const readiness=await checkNativeRuntimePreflight();
 if(!readiness.ready){
  console.error(JSON.stringify({stage:'M-2.02g',status:'PREFLIGHT_DENIED',reason:readiness.status}));
  process.exitCode=2;return;
 }
 const service=new NativeDesktopChatService();
 const samples:LocalBenchmarkSample[]=[];
 const messages:ModelMessage[]=[{role:'system',content:'Answer briefly in Indonesian. No external tools.'}];
 const questions=[
  'Jawab satu kata: siap.',
  'Sebutkan satu manfaat AI lokal dalam satu kalimat.',
  'Jelaskan arti keamanan data dalam satu kalimat.',
 ];
 try{
  for(const question of questions){
   messages.push({role:'user',content:question});
   const freeBeforeBytes=os.freemem(),processRssBeforeBytes=process.memoryUsage().rss;
   const start=performance.now();
   const response=await service.chat({messages});
   const elapsedMs=Math.max(0,Math.round(performance.now()-start));
   const freeAfterBytes=os.freemem(),processRssAfterBytes=process.memoryUsage().rss;
   samples.push({elapsedMs,freeBeforeBytes,freeAfterBytes,processRssBeforeBytes,processRssAfterBytes,success:response.success});
   if(!response.success){
    console.error(JSON.stringify({stage:'M-2.02g',status:'LOCAL_INFERENCE_FAILED',reason:response.error,turn:samples.length}));
    process.exitCode=1;break;
   }
   if(response.model!=='qwen2.5:3b'||response.source!=='LOCAL_ENDPOINT'){
    console.error(JSON.stringify({stage:'M-2.02g',status:'MODEL_OR_LOCALITY_MISMATCH'}));
    process.exitCode=1;break;
   }
   messages.push({role:'assistant',content:response.text!});
  }
 }finally{service.stop();}
 console.log(JSON.stringify({stage:'M-2.02g',mode:'LIVE_LOCAL_OLLAMA',model:'qwen2.5:3b',
  ...summarizeLocalBenchmark(samples),source:'LOCAL_ENDPOINT',nodeProcessMemoryOnly:true,
  observedSystemFreeMemoryNotModelRam:true,semanticQuality:'NOT_SCORED',
  desktopGui:'NOT_TESTED',windowsCheckpointDurability:'NOT_TESTED',
  profileAutomaticallyApproved:false},null,2));
}
main().catch(e=>{console.error('MIO_BENCHMARK_FAILED:',e instanceof Error?e.message:'UNKNOWN');process.exitCode=1;});
