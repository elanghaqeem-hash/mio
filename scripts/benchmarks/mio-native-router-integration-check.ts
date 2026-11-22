import assert from 'node:assert/strict';
import { ModelRouter } from '../../src/agents/ModelRouter';
import { emergencyStop } from '../../src/core/EmergencyStop';
async function main(){
 const original=globalThis.fetch,config=ModelRouter.getConfig();
 emergencyStop.reset();
 const calls:string[]=[];
 const messages=[{role:'system' as const,content:'Answer briefly'},{role:'user' as const,content:'Halo'},{role:'assistant' as const,content:'Hai'},{role:'user' as const,content:'Siapa kamu?'}];
 try{
  ModelRouter.configure({provider:'openai',enableWebSearch:true,allowOfflineFallback:true});
  globalThis.fetch=async(url,init)=>{
   const path=String(url);calls.push(path);
   assert.ok(path.startsWith('http://127.0.0.1:11434/'));
   if(path.endsWith('/api/tags'))return Response.json({models:[{name:'qwen2.5:3b'}]});
   assert.deepEqual(JSON.parse(String(init?.body)).messages,messages);
   return Response.json({done:true,model:'qwen2.5:3b',message:{content:'MIO'}});
  };
  const result=await ModelRouter.generateNativeLocal({messages});
  assert.equal(result.text,'MIO');assert.equal(result.provider,'ollama');assert.equal(result.source,'LOCAL_ENDPOINT');
  assert.equal(ModelRouter.getConfig().provider,'openai');
  assert.equal(ModelRouter.getRecentProvenance().at(-1)?.locality,'LOCAL');
  assert.equal(calls.filter(x=>x.endsWith('/api/chat')).length,1);
  globalThis.fetch=async()=>Response.json({models:[]});
  await assert.rejects(ModelRouter.generateNativeLocal({messages}),/NO_READY_MODEL/);
  globalThis.fetch=async()=>new Promise<Response>(()=>{});
  await assert.rejects(ModelRouter.generateNativeLocal({messages},undefined,20),/timed out/i);
  const pending=ModelRouter.generateNativeLocal({messages});const rejected=assert.rejects(pending,/cancelled/i);
  emergencyStop.triggerEmergencyStop('router integration test',{fromMainProcess:true});await rejected;
  await assert.rejects(ModelRouter.generateNativeLocal({messages}),/cancelled/i);
 }finally{globalThis.fetch=original;ModelRouter.configure(config);emergencyStop.reset();}
 console.log(JSON.stringify({stage:'M-2.01c',mainRouter:'pass',mockTransport:true,liveInference:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
