import assert from 'node:assert/strict';
import { MioCoreLocalModelAdapter } from '../../src/intelligence/model/MioCoreLocalModelAdapter';
import { emergencyStop } from '../../src/core/EmergencyStop';
async function main(){
 emergencyStop.reset();
 const calls:string[]=[];
 const transport:typeof fetch=async (url,init)=>{
  calls.push(String(url));assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'qwen2.5:3b'}]});
  assert.equal(JSON.parse(String(init?.body)).model,'qwen2.5:3b');
  return Response.json({done:true,model:'qwen2.5:3b',message:{content:' SIAP '}});
 };
 const adapter=new MioCoreLocalModelAdapter(undefined,transport);
 try{
  assert.equal((await adapter.readiness()).ready,true);
  assert.equal((await adapter.generate('Halo')).text,'SIAP');
  assert.deepEqual(calls,['http://127.0.0.1:11434/api/tags','http://127.0.0.1:11434/api/chat']);
  assert.throws(()=>adapter.generate(''),/PROMPT_INVALID/);
  await assert.rejects(adapter.generate('Halo',0),/TIMEOUT_INVALID/);
 }finally{adapter.dispose();}
 const invalid=new MioCoreLocalModelAdapter(undefined,async()=>Response.json({done:true,model:'other',message:{content:'wrong'}}));
 try{await assert.rejects(invalid.generate('Halo'),/RESPONSE_INVALID/);}finally{invalid.dispose();}
 let signal:AbortSignal|null|undefined;
 const slow=new MioCoreLocalModelAdapter(undefined,async(_,init)=>{signal=init?.signal;return new Promise<Response>(()=>{});});
 try{
  await assert.rejects(slow.generate('Halo',10),/TIMEOUT/);assert.equal(signal?.aborted,true);
  const pending=slow.generate('Halo');
  const rejected=assert.rejects(pending,/STOPPED/);
  await Promise.resolve();
  emergencyStop.triggerEmergencyStop('local model test',{fromMainProcess:true});
  await rejected;assert.equal(signal?.aborted,true);
  emergencyStop.reset();await assert.rejects(slow.generate('Halo'),/ADMISSION_DENIED/);
 }finally{slow.dispose();emergencyStop.reset();}
 console.log(JSON.stringify({stage:'M-1.02b',localModelAdapter:'pass',mockTransport:true,liveInference:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
