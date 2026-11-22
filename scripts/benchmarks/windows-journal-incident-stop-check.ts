import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { emergencyStop } from '../../src/core/EmergencyStop';
import { WindowsJournalIncidentRegistry } from '../../src/observability/WindowsJournalIncidentRegistry';
import { WindowsJournalIncidentStorage, type IncidentStorageSnapshot } from '../../src/observability/WindowsJournalIncidentStorage';
import { bindIncidentEmergencyStop } from '../../src/observability/WindowsJournalIncidentStopBridge';
function fixture(){
 let snapshot:IncidentStorageSnapshot={generation:0,serialized:null,digest:null};
 const registry=new WindowsJournalIncidentRegistry();
 const storage=new WindowsJournalIncidentStorage({read:()=>({...snapshot}),compareAndSwap:(_,next)=>{snapshot={...next};return true;}},randomBytes(32));
 const bridge=bindIncidentEmergencyStop(registry,storage);
 return {registry,storage,bridge};
}
function denied(f:ReturnType<typeof fixture>){
 assert.equal(f.bridge.isStopped(),true);
 assert.equal(f.registry.inspect().stopped,true);
 assert.throws(()=>f.storage.inspect(),/MIO_INCIDENT_STORAGE_DENIED/);
 assert.throws(()=>f.registry.register('incidentA',{projectId:'p',taskId:'t',requestId:'r'},1000),/MIO_INCIDENT_DENIED/);
}
try {
 emergencyStop.reset();
 const a=fixture();
 try {
  assert.equal(a.bridge.isStopped(),false);
  emergencyStop.triggerEmergencyStop('incident test',{fromMainProcess:true});
  denied(a);
  const b=fixture();try{denied(b);}finally{b.bridge.dispose();}
  emergencyStop.reset();denied(a);
 }finally{a.bridge.dispose();}
 const c=fixture();c.bridge.dispose();denied(c);c.bridge.dispose();
 console.log(JSON.stringify({probe:'PRV-11.04m',coreStop:'pass',productionReady:false}));
}finally{emergencyStop.reset();}
