/** Run on an authorized Windows workstation with Ollama installed. No cloud credentials. */
import assert from 'node:assert/strict';
import { NativeDesktopChatService } from '../../electron/ipc/nativeLocalChat';
import type { ModelMessage } from '../../src/types/models';

const MODEL='qwen2.5:3b';
const HOST='http://127.0.0.1:11434';
const LIMIT_MS=120000;
type Trial={turn:number;durationMs:number;model:string;responseChars:number;heapDeltaBytes:number;rssBytes:number;cpuUserMicros:number;cpuSystemMicros:number};
async function main(){
 if(process.env.MIO_LIVE_OLLAMA!=='1'){
  console.error('NOT_RUN: set MIO_LIVE_OLLAMA=1 to opt into real local Ollama inference. No tests were run.');
  process.exitCode=2;return;
 }
 const start=performance.now();
 const health=await fetch(HOST+'/api/tags',{signal:AbortSignal.timeout(8000),redirect:'error',credentials:'omit'});
 assert.equal(health.ok,true,'Local Ollama endpoint must be ready');
 const inventory=await health.json();
 assert.ok(Array.isArray(inventory.models)&&inventory.models.some((m:{name?:string})=>m.name===MODEL),
   'Required model qwen2.5:3b must be installed with ollama pull qwen2.5:3b');
 const svc=new NativeDesktopChatService();
 const history:ModelMessage[]=[{role:'system',content:'Respond briefly in Indonesian. Do not use external tools.'}];
 const prompts=[
  'Perkenalkan dirimu dalam satu kalimat. Namamu dalam percakapan ini adalah MIO.',
  'Apa nama yang kamu gunakan pada jawaban sebelumnya? Jawab singkat.',
 ];
 const samples:Trial[]=[];
 try{
  for(let i=0;i<prompts.length;i++){
   history.push({role:'user',content:prompts[i]});
   const heap=process.memoryUsage().heapUsed;
   const beforeCpu=process.cpuUsage();
   const started=performance.now();
   const response=await svc.chat({messages:history});
   const ms=Math.round(performance.now()-started);
   assert.equal(response.success,true,'Inference turn '+(i+1)+' failed: '+response.error);
   assert.equal(response.model,MODEL,'Wrong local model returned');
   assert.equal(response.source,'LOCAL_ENDPOINT','Response came from nonlocal source');
   assert.ok(response.text&&response.text.length>0,'Empty local inference response');
   history.push({role:'assistant',content:response.text!});
   const cpu=process.cpuUsage(beforeCpu);
   samples.push({turn:i+1,durationMs:ms,model:response.model!,responseChars:response.text!.length,heapDeltaBytes:process.memoryUsage().heapUsed-heap,rssBytes:process.memoryUsage().rss,cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system});
  }
 }finally{svc.stop();}
 const durations=samples.map(x=>x.durationMs).sort((a,b)=>a-b);
 const result={stage:'M-2.02b',mode:'LIVE_LOCAL_OLLAMA',status:'PASS_TRANSPORT_AND_TWO_TURNS',model:MODEL,host:HOST,
  totalDurationMs:Math.round(performance.now()-start),samples,
  p50TurnMs:durations[Math.ceil(durations.length*.5)-1]??null,
  p95TurnMs:durations[Math.ceil(durations.length*.95)-1]??null,
  serviceDiagnostics:svc.inspect(),
  cpuScope:'NODE_PROCESS_ONLY',memoryScope:'NODE_PROCESS_ONLY',gpuUsage:'NOT_MEASURED',
  semanticQuality:'NOT_SCORED',powerLossDurability:'NOT_TESTED',desktopGui:'NOT_TESTED',
  externalApiKeysRequired:false};
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error('MIO_LIVE_RUNTIME_FAILED:',e instanceof Error?e.message:String(e));process.exitCode=1;});
