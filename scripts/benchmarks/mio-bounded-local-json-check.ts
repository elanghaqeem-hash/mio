import assert from 'node:assert/strict';
import { readBoundedLocalJson } from '../../src/intelligence/model/MioBoundedLocalJson';
import { MioCoreLocalModelAdapter } from '../../src/intelligence/model/MioCoreLocalModelAdapter';
import { MioNativeModelInventory } from '../../src/intelligence/model/MioNativeModelInventory';
import { emergencyStop } from '../../src/core/EmergencyStop';
const large='x'.repeat(1500000);
function chunked(body:string,chunkSize:number):Response{
 const bytes=new TextEncoder().encode(body);
 return new Response(new ReadableStream<Uint8Array>({
  start(controller){
   for(let i=0;i<bytes.length;i+=chunkSize)controller.enqueue(bytes.slice(i,i+chunkSize));
   controller.close();
  }
 }),{headers:{'content-type':'application/json'}});
}
async function main(){
 emergencyStop.reset();
 assert.deepEqual(await readBoundedLocalJson(Response.json({ok:true}),100),{ok:true});
 assert.deepEqual(await readBoundedLocalJson(chunked(JSON.stringify({m:'ok'}),2),100),{m:'ok'});
 await assert.rejects(readBoundedLocalJson(new Response('{"ok":true}',{headers:{'content-length':'200'}}),20),/TOO_LARGE/);
 await assert.rejects(readBoundedLocalJson(new Response('{"ok":true}',{headers:{'content-length':'oops'}}),200),/LENGTH_INVALID/);
 await assert.rejects(readBoundedLocalJson(chunked(JSON.stringify({body:large}),8192),1048576),/TOO_LARGE/);
 await assert.rejects(readBoundedLocalJson(new Response('{'),100),/JSON_INVALID/);
 await assert.rejects(readBoundedLocalJson(new Response(new Uint8Array([0xff])),100),/JSON_INVALID/);
 await assert.rejects(readBoundedLocalJson(Response.json({ok:true}),0),/LIMIT_INVALID/);
 let chatCalls=0;
 const adapter=new MioCoreLocalModelAdapter(undefined,async(url)=>{
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'qwen2.5:3b'}]});
  chatCalls++;return chunked(JSON.stringify({done:true,model:'qwen2.5:3b',message:{content:large}}),4096);
 });
 try{
  assert.equal((await adapter.readiness()).ready,true);
  await assert.rejects(adapter.generate('Hello'),/TOO_LARGE/);
  assert.equal(chatCalls,1);
 }finally{adapter.dispose();}
 const inventory=new MioNativeModelInventory(async()=>chunked(JSON.stringify({models:[{name:'qwen2.5:3b',padding:large}]}),65536));
 try{await assert.rejects(inventory.discover(),/TOO_LARGE/);}finally{inventory.dispose();}
 console.log(JSON.stringify({stage:'M-2.02c',boundedJson:'pass',oversizeRejected:true,liveInference:false}));
 emergencyStop.reset();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
