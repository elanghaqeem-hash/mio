import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { WindowsJournalIncidentStorage, type IncidentStorageSnapshot, type IncidentStorageBackend } from '../../src/observability/WindowsJournalIncidentStorage';
import type { IncidentAuditRecord } from '../../src/observability/WindowsJournalIncidentArchive';
const key=randomBytes(32);
const row:IncidentAuditRecord={incidentId:'incidentA',projectId:'projectA',taskId:'taskA',requestId:'requestA',state:'OPEN',recordedAt:1000};
class Fixture implements IncidentStorageBackend {
 current:IncidentStorageSnapshot={generation:0,serialized:null,digest:null};
 reject=false; corruptAfter=false;
 read(){return {...this.current};}
 compareAndSwap(expected:IncidentStorageSnapshot,next:IncidentStorageSnapshot){
  if(this.reject||JSON.stringify(expected)!==JSON.stringify(this.current))return false;
  this.current={...next};
  if(this.corruptAfter)this.current.digest='bad';
  return true;
 }
}
const denied=(fn:()=>unknown)=>assert.throws(fn,/MIO_INCIDENT_STORAGE_DENIED/);
const db=new Fixture(), storage=new WindowsJournalIncidentStorage(db,key);
assert.equal(storage.inspect().generation,0);
assert.equal(storage.commit(0,[row]).generation,1);
const old=db.read();
const reopened=new WindowsJournalIncidentStorage(db,key);
assert.deepEqual(reopened.inspect().records,[row]);
assert.equal(reopened.commit(1,[{...row,state:'REVIEWED'}]).generation,2);
const latest=db.read();
denied(()=>storage.commit(1,[row]));denied(()=>storage.inspect());
assert.deepEqual(db.read(),latest);
db.current={...old,generation:2};
denied(()=>new WindowsJournalIncidentStorage(db,key).inspect());
db.current={...latest,digest:'bad'};
denied(()=>new WindowsJournalIncidentStorage(db,key).inspect());
db.current=latest;
denied(()=>new WindowsJournalIncidentStorage(db,randomBytes(32)).inspect());
const race=new Fixture();race.reject=true;
const blocked=new WindowsJournalIncidentStorage(race,key);
denied(()=>blocked.commit(0,[row]));race.reject=false;denied(()=>blocked.commit(0,[row]));
assert.equal(race.current.generation,0);
const broken=new Fixture();broken.corruptAfter=true;
const uncertain=new WindowsJournalIncidentStorage(broken,key);
denied(()=>uncertain.commit(0,[row]));denied(()=>uncertain.inspect());
const stopped=new WindowsJournalIncidentStorage(new Fixture(),key);stopped.stop();denied(()=>stopped.commit(0,[row]));
console.log(JSON.stringify({probe:'PRV-11.04l',storageContract:'pass',mockBackend:true,productionReady:false}));
