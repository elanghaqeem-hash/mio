import assert from 'node:assert/strict';
import { allocateLocalModels } from '../../src/intelligence/model/MioModelAllocation';
import { MioCognitiveOrchestrator, type LocalModelProfile } from '../../src/intelligence/model/MioCognitiveOrchestrator';
import { emergencyStop } from '../../src/core/EmergencyStop';
async function main(){
 emergencyStop.reset();
 const inventory=[{name:'big:7b',sizeBytes:7000},{name:'small:3b',sizeBytes:3000},{name:'unknown:1b',sizeBytes:null},{name:'untrusted:1b',sizeBytes:1000}];
 const profiles:LocalModelProfile[]=[{model:'big:7b',workloads:['CODE']},{model:'small:3b',workloads:['CODE','CHAT']},{model:'unknown:1b',workloads:['CODE']}];
 assert.deepEqual(allocateLocalModels(inventory,profiles,'CODE',{maxModelFileBytes:4000}).map(p=>p.model),['small:3b']);
 assert.deepEqual(allocateLocalModels(inventory,profiles,'CODE',{maxModelFileBytes:7000}).map(p=>p.model),['big:7b','small:3b']);
 assert.deepEqual(allocateLocalModels(inventory,profiles,'ANALYSIS',{maxModelFileBytes:7000}),[]);
 assert.throws(()=>allocateLocalModels(inventory,profiles,'CODE',{maxModelFileBytes:NaN}),/BUDGET_INVALID/);
 const calls:string[]=[];
 const core=new MioCognitiveOrchestrator(profiles,async(url,init)=>{
  if(String(url).endsWith('/api/tags'))return Response.json({models:inventory.map(x=>({name:x.name,size:x.sizeBytes}))});
  const model=JSON.parse(String(init?.body)).model;calls.push(model);
  return Response.json({done:true,model,message:{content:'SIAP'}});
 });
 try{
  assert.equal((await core.generate('kode',1000,'CODE',{maxModelFileBytes:4000})).model,'small:3b');
  await assert.rejects(core.generate('kode',1000,'CODE',{maxModelFileBytes:2000}),/NO_READY_MODEL/);
  assert.deepEqual(calls,['small:3b']);
  assert.equal((await core.generate('kode',1000,'CODE')).model,'big:7b');
  emergencyStop.triggerEmergencyStop('allocation test',{fromMainProcess:true});
  await assert.rejects(core.generate('kode'),/ADMISSION_DENIED/);
 }finally{core.dispose();emergencyStop.reset();}
 console.log(JSON.stringify({stage:'M-2.01b',allocation:'pass',mockTransport:true,hardwareMeasured:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
