import assert from 'node:assert/strict';
import { selectCalibratedLocalModels, type CalibratedLocalModel } from '../../src/intelligence/model/MioAdaptiveLocalModelSelection';
import { NativeDesktopChatService } from '../../electron/ipc/nativeLocalChat';
import type { ModelMessage } from '../../src/types/models';
const MIB=1024*1024;
const hardware=()=>({totalMemoryBytes:16*1024*MIB,freeMemoryBytes:7*1024*MIB,logicalCpuCount:8});
const profiles:CalibratedLocalModel[]=[
 {model:'larger:7b',workloads:['CODE','ANALYSIS'],requiredFreeMemoryBytes:5*1024*MIB,calibration:'USER_VERIFIED'},
 {model:'qwen2.5:3b',workloads:['CHAT','CODE'],requiredFreeMemoryBytes:2*1024*MIB,calibration:'USER_VERIFIED'},
];
const inventory=[{name:'larger:7b',sizeBytes:2000000000},{name:'qwen2.5:3b',sizeBytes:null}];
const messages:ModelMessage[]=[{role:'user',content:'kode python sederhana'}];
async function main(){
 const chosen=selectCalibratedLocalModels({inventory,profiles,workload:'CODE',freeMemoryBytes:hardware().freeMemoryBytes,reserveMemoryBytes:768*MIB});
 assert.deepEqual(chosen.map(x=>x.model),['larger:7b','qwen2.5:3b']);
 assert.deepEqual(selectCalibratedLocalModels({inventory,profiles,workload:'CHAT',freeMemoryBytes:3*1024*MIB,reserveMemoryBytes:768*MIB}).map(x=>x.model),['qwen2.5:3b']);
 assert.deepEqual(selectCalibratedLocalModels({inventory,profiles,workload:'CREATIVE',freeMemoryBytes:hardware().freeMemoryBytes,reserveMemoryBytes:768*MIB}),[]);
 assert.deepEqual(selectCalibratedLocalModels({inventory,profiles,workload:'CODE',freeMemoryBytes:500*MIB,reserveMemoryBytes:768*MIB}),[]);
 for(const bad of [
  {...profiles[0],calibration:'AUTO_GUESSED'},
  {...profiles[0],requiredFreeMemoryBytes:0},
  {...profiles[0],requiredFreeMemoryBytes:NaN},
  {...profiles[0],model:'../../remote'},
 ]){
  assert.throws(()=>selectCalibratedLocalModels({inventory,profiles:[bad as CalibratedLocalModel],workload:'CODE',freeMemoryBytes:hardware().freeMemoryBytes,reserveMemoryBytes:768*MIB}),/PROFILE_INVALID/);
 }
 assert.throws(()=>selectCalibratedLocalModels({inventory,profiles:[profiles[0],profiles[0]],workload:'CODE',freeMemoryBytes:hardware().freeMemoryBytes,reserveMemoryBytes:768*MIB}),/PROFILE_INVALID/);
 const calls:string[]=[];
 const transport:typeof fetch=async(url,init)=>{
  assert.ok(String(url).startsWith('http://127.0.0.1:11434/'));
  if(String(url).endsWith('/api/tags'))return Response.json({models:inventory});
  const model=JSON.parse(String(init?.body)).model;
  calls.push(model);
  return Response.json({done:true,model,message:{content:'SIAP'}});
 };
 const service=new NativeDesktopChatService(transport,2000,hardware,profiles);
 try{
  const response=await service.chat({messages});
  assert.equal(response.success,true);
  assert.equal(response.model,'larger:7b');
  assert.deepEqual(calls,['larger:7b']);
 }finally{service.stop();}
 const low=new NativeDesktopChatService(transport,2000,()=>({...hardware(),freeMemoryBytes:1100*MIB}),profiles);
 try{
  const before=calls.length;
  const denied=await low.chat({messages});
  assert.equal(denied.success,false);
  assert.equal(denied.error,'MIO_NATIVE_NO_CALIBRATED_MODEL');
  assert.equal(calls.length,before,'denial must not perform inference');
 }finally{low.stop();}
 const unchanged=new NativeDesktopChatService(transport,2000,hardware);
 try{
  const response=await unchanged.chat({messages});
  assert.equal(response.model,'qwen2.5:3b','legacy default must stay unchanged');
 }finally{unchanged.stop();}
 console.log(JSON.stringify({stage:'M-2.02f',selection:'pass',explicitCalibration:true,defaultUnchanged:true,liveInference:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
