/** Diagnostic archive codec only; caller owns trusted storage and independent generation anchor. */
import { createHmac, timingSafeEqual } from 'node:crypto';
export interface IncidentAuditRecord {
 incidentId:string; projectId:string; taskId:string; requestId:string;
 state:'OPEN'|'REVIEWED'|'STOPPED'; recordedAt:number;
}
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const HEX=/^[a-f0-9]{64}$/;
const LIMIT=1024, MAX_BYTES=1024*1024;
const fields=['incidentId','projectId','taskId','requestId','state','recordedAt'];
const fail=():never=>{throw Error('MIO_INCIDENT_ARCHIVE_DENIED');};
function validate(records:unknown):IncidentAuditRecord[]{
 if(!Array.isArray(records)||records.length>LIMIT)return fail();
 const seen=new Set<string>();
 return records.map(v=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fields.length||!fields.every(f=>Object.hasOwn(v,f))||
    ![v.incidentId,v.projectId,v.taskId,v.requestId].every(x=>typeof x==='string'&&ID.test(x))||
    !['OPEN','REVIEWED','STOPPED'].includes(v.state)||!Number.isSafeInteger(v.recordedAt)||v.recordedAt<0||seen.has(v.incidentId))return fail();
  seen.add(v.incidentId);
  return {incidentId:v.incidentId,projectId:v.projectId,taskId:v.taskId,requestId:v.requestId,state:v.state,recordedAt:v.recordedAt};
 });
}
function keyCheck(key:Buffer,generation:number){
 if(!Buffer.isBuffer(key)||key.length<32||!Number.isSafeInteger(generation)||generation<1)fail();
}
function mac(key:Buffer,body:string){return createHmac('sha256',key).update('MIO-INCIDENT-ARCHIVE-V1\n').update(body).digest('hex');}
export function sealIncidentArchive(key:Buffer,generation:number,records:readonly IncidentAuditRecord[]):string{
 keyCheck(key,generation);
 const body=JSON.stringify({version:1,generation,records:validate(records)});
 return JSON.stringify({body,mac:mac(key,body)});
}
export function openIncidentArchive(key:Buffer,serialized:string,expectedGeneration:number): {generation:number;records:IncidentAuditRecord[];runtimeActivationPermitted:false;lockReleasePermitted:false;automaticReplayPermitted:false}{
 try{
  keyCheck(key,expectedGeneration);
  if(typeof serialized!=='string'||Buffer.byteLength(serialized)>MAX_BYTES)return fail();
  const envelope=JSON.parse(serialized);
  if(!envelope||Object.keys(envelope).length!==2||typeof envelope.body!=='string'||typeof envelope.mac!=='string'||!HEX.test(envelope.mac))return fail();
  if(!timingSafeEqual(Buffer.from(envelope.mac,'hex'),Buffer.from(mac(key,envelope.body),'hex')))return fail();
  const body=JSON.parse(envelope.body);
  if(!body||Object.keys(body).length!==3||body.version!==1||body.generation!==expectedGeneration)return fail();
  const records=validate(body.records);
  if(JSON.stringify({version:1,generation:expectedGeneration,records})!==envelope.body)return fail();
  return {generation:expectedGeneration,records,runtimeActivationPermitted:false,lockReleasePermitted:false,automaticReplayPermitted:false};
 }catch{return fail();}
}
