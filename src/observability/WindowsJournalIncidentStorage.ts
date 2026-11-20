/** Diagnostic storage contract; no production adapter or runtime activation.
 * Trusted backend must own atomic compare-and-swap and a non-rollbackable anchor.
 */
import { createHash } from 'node:crypto';
import { sealIncidentArchive, openIncidentArchive, type IncidentAuditRecord } from './WindowsJournalIncidentArchive';
export interface IncidentStorageSnapshot {generation:number;serialized:string|null;digest:string|null}
export interface IncidentStorageBackend {
 read():IncidentStorageSnapshot;
 compareAndSwap(expected:IncidentStorageSnapshot,next:IncidentStorageSnapshot):boolean;
}
const fail=():never=>{throw Error('MIO_INCIDENT_STORAGE_DENIED');};
const digest=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
export class WindowsJournalIncidentStorage {
 private readonly key:Buffer;
 private stopped=false;
 constructor(private readonly backend:IncidentStorageBackend,key:Buffer){
  if(!Buffer.isBuffer(key)||key.length<32)fail();
  this.key=Buffer.from(key);
 }
 private readVerified(){
  const snapshot={...this.backend.read()};
  if(!Number.isSafeInteger(snapshot.generation)||snapshot.generation<0) return fail();
  if(snapshot.generation===0){
   if(snapshot.serialized!==null||snapshot.digest!==null)return fail();
   return {snapshot,records:[] as IncidentAuditRecord[]};
  }
  if(typeof snapshot.serialized!=='string'||Buffer.byteLength(snapshot.serialized)>1048576||snapshot.digest!==digest(snapshot.serialized))return fail();
  return {snapshot,records:openIncidentArchive(this.key,snapshot.serialized,snapshot.generation).records};
 }
 inspect(){
  if(this.stopped)return fail();
  try{
   const {snapshot,records}=this.readVerified();
   return {generation:snapshot.generation,records,runtimeActivationPermitted:false as const};
  }catch{this.stopped=true;return fail();}
 }
 commit(expectedGeneration:number,records:readonly IncidentAuditRecord[]){
  if(this.stopped)return fail();
  try{
   const {snapshot}=this.readVerified();
   if(snapshot.generation!==expectedGeneration||expectedGeneration===Number.MAX_SAFE_INTEGER)return fail();
   const generation=expectedGeneration+1;
   const serialized=sealIncidentArchive(this.key,generation,records);
   if(Buffer.byteLength(serialized)>1048576)return fail();
   const next={generation,serialized,digest:digest(serialized)};
   if(!this.backend.compareAndSwap(snapshot,next))return fail();
   const verified=this.readVerified();
   if(verified.snapshot.generation!==generation||verified.snapshot.digest!==next.digest||verified.snapshot.serialized!==serialized)return fail();
   return {generation,runtimeActivationPermitted:false as const};
  }catch{this.stopped=true;return fail();}
 }
 stop(){this.stopped=true;}
}
