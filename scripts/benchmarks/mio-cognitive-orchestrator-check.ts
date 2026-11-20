import assert from 'node:assert/strict';
import { MioCognitiveOrchestrator, classifyCognitiveRequest } from '../../src/intelligence/model/MioCognitiveOrchestrator';
import { emergencyStop } from '../../src/core/EmergencyStop';
async function main(){
 emergencyStop.reset();
 assert.equal(classifyCognitiveRequest('Tulis kode Python'),'CODE');
 assert.equal(classifyCognitiveRequest('Analisis risiko'),'ANALYSIS');
 assert.equal(classifyCognitiveRequest('Buat cerita'),'CREATIVE');
 assert.equal(classifyCognitiveRequest('Halo Mio'),'CHAT');
 const calls:string[]=[];
 const transport:typeof fetch=async(url,init)=>{
  assert.ok(String(url).startsWith('http://127.0.0.1:11434/'));
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'qwen2.5:3b'}]});
  const model=JSON.parse(String(init?.body)).model;calls.push(model);
  return Response.json({done:true,model,message:{content:'SIAP'}});
 };
 const core=new MioCognitiveOrchestrator([{model:'missing:7b',workloads:['CODE']},{model:'qwen2.5:3b',workloads:['CHAT','CODE']}],transport);
 try{
  const result=await core.generate('Tulis kode');
  assert.equal(result.workload,'CODE');assert.equal(result.model,'qwen2.5:3b');assert.equal(result.mutationPermitted,false);
  assert.deepEqual(calls,['qwen2.5:3b']);
  await assert.rejects(core.generate('Analisis risiko'),/NO_READY_MODEL/);
  assert.equal((await core.generate('Analisis risiko',1000,'CHAT')).workload,'CHAT');
  await assert.rejects(core.generate(''),/REQUEST_INVALID/);
  emergencyStop.triggerEmergencyStop('cognitive test',{fromMainProcess:true});
  await assert.rejects(core.generate('Halo'),/ADMISSION_DENIED/);
 }finally{core.dispose();emergencyStop.reset();}
 console.log(JSON.stringify({stage:'M-1.02c',cognitiveRouting:'pass',mockTransport:true,liveInference:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
