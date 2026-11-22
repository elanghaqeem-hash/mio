import assert from 'node:assert/strict';
import { checkNativeRuntimePreflight } from '../../electron/ipc/nativeRuntimePreflight';
const MIB=1024*1024;
const healthy=()=>({totalMemoryBytes:8*1024*MIB,freeMemoryBytes:4*1024*MIB,logicalCpuCount:8});
async function main(){
 let requests=0;
 const transport:typeof fetch=async(url,init)=>{
  requests++;
  assert.equal(String(url),'http://127.0.0.1:11434/api/tags');
  assert.equal(init?.redirect,'error');
  assert.equal(init?.credentials,'omit');
  return Response.json({models:[{name:'qwen2.5:3b'}]});
 };
 const ready=await checkNativeRuntimePreflight(transport,healthy);
 assert.equal(ready.status,'READY');
 assert.equal(ready.ready,true);
 assert.equal(ready.installedTargetModel,true);
 assert.equal(ready.inferenceExecuted,false);
 assert.equal(ready.endpoint,'LOCAL_LOOPBACK_ONLY');
 assert.equal(requests,1);
 const low=await checkNativeRuntimePreflight(transport,()=>({...healthy(),freeMemoryBytes:100*MIB}));
 assert.equal(low.status,'LOW_MEMORY');
 assert.equal(requests,1,'memory denial must not access transport');
 const unknown=await checkNativeRuntimePreflight(transport,()=>{throw Error('private hardware details');});
 assert.equal(unknown.status,'HARDWARE_UNKNOWN');
 assert.equal(requests,1);
 const missing=await checkNativeRuntimePreflight(async()=>Response.json({models:[{name:'other:1b'}]}),healthy);
 assert.equal(missing.status,'MODEL_MISSING');
 const offline=await checkNativeRuntimePreflight(async()=>{throw Error('private network details');},healthy);
 assert.equal(offline.status,'OLLAMA_UNREACHABLE');
 assert.equal(JSON.stringify(offline).includes('private'),false);
 const hung=await checkNativeRuntimePreflight(async()=>new Promise<Response>(()=>{}),healthy,20);
 assert.equal(hung.status,'OLLAMA_UNREACHABLE');
 await assert.rejects(checkNativeRuntimePreflight(transport,healthy,0),/TIMEOUT_INVALID/);
 console.log(JSON.stringify({stage:'M-2.02e',preflight:'pass',offlineFailClosed:true,hardwareDeniedWithoutNetwork:true,liveInference:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
