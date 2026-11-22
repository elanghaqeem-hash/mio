import assert from 'node:assert/strict';
import { MioNativeModelInventory,parseLocalInventory,selectInstalledProfiles } from '../../src/intelligence/model/MioNativeModelInventory';
import { emergencyStop } from '../../src/core/EmergencyStop';
async function main(){
 emergencyStop.reset();
 const inventory=new MioNativeModelInventory(async(url,init)=>{
  assert.equal(String(url),'http://127.0.0.1:11434/api/tags');
  assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');
  return Response.json({models:[{name:'qwen2.5:3b',size:2000},{name:'unknown:7b'}]});
 });
 try{
  const found=await inventory.discover();
  assert.deepEqual(found,[{name:'qwen2.5:3b',sizeBytes:2000},{name:'unknown:7b',sizeBytes:null}]);
  assert.deepEqual(selectInstalledProfiles(found,[{model:'missing:7b',workloads:['CHAT']},{model:'qwen2.5:3b',workloads:['CHAT']}],'CHAT'),[{model:'qwen2.5:3b',workloads:['CHAT']}]);
  assert.deepEqual(selectInstalledProfiles(found,[{model:'qwen2.5:3b',workloads:['CHAT']}],'CODE'),[]);
  for(const payload of [null,{}, {models:[{name:'x'},{name:'x'}]},{models:[{name:'bad model'}]},{models:Array.from({length:513},(_,i)=>({name:'m'+i}))}])assert.throws(()=>parseLocalInventory(payload),/INVENTORY_INVALID/);
 }finally{inventory.dispose();}
 const slow=new MioNativeModelInventory(async()=>new Promise<Response>(()=>{}));
 try{
  await assert.rejects(slow.discover(10),/INVENTORY_TIMEOUT/);
  const pending=slow.discover();const rejected=assert.rejects(pending,/INVENTORY_STOPPED/);
  emergencyStop.triggerEmergencyStop('inventory test',{fromMainProcess:true});await rejected;
  await assert.rejects(slow.discover(),/ADMISSION_DENIED/);
 }finally{slow.dispose();emergencyStop.reset();}
 console.log(JSON.stringify({stage:'M-2.01a',inventory:'pass',mockTransport:true,liveInference:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
