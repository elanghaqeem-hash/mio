import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { encodeJournalRecord, decodeJournalRecords } from '../../src/observability/WindowsJournalBinaryCodec';
import { inspectJournalMutationCommit } from '../../src/observability/WindowsJournalCommitVerifier';
assert.equal(process.platform,'win32');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-logical-session-'));
const id={projectId:'projectA',taskId:'taskA',requestId:'requestA'};
const blank=Buffer.alloc(0);
function record(prior:Buffer,phase:string,sequence:number,extra:Record<string,unknown>={}) {
 const state=decodeJournalRecords(prior);
 return encodeJournalRecord(JSON.stringify({version:1,...id,phase,sequence,previousDigest:state.entries.at(-1)?.digest??null,...extra}),state.lastHash,state.size).record;
}
try {
 const file=path.join(root,'journal'),fixture=path.join(root,'record');
 const check=(prior:Buffer,candidate:Buffer,error?:RegExp)=>{
  fs.writeFileSync(file,prior);fs.writeFileSync(fixture,candidate);
  const result=spawnSync('pwsh',['-NoProfile','-File','scripts/benchmarks/windows-native-logical-session.ps1',file,fixture],{encoding:'utf8',timeout:30000});
  assert.ifError(result.error);
  if(error){assert.notEqual(result.status,0);assert.match(result.stderr,error);assert.deepEqual(fs.readFileSync(file),prior);}
  else {assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readFileSync(file),Buffer.concat([prior,candidate]));}
 };
 const prepared=record(blank,'PREPARED',1);
 const executing=record(prepared,'EXECUTING',2);
 const running=Buffer.concat([prepared,executing]);
 const committed=record(running,'COMMITTED',3);
 const terminal=Buffer.concat([running,committed]);
 check(blank,prepared);check(prepared,executing);check(running,committed);
 assert.equal(inspectJournalMutationCommit(decodeJournalRecords(terminal).entries,id).status,'LOGICALLY_COMMITTED');
 check(terminal,record(terminal,'PREPARED',4),/MIO_LOGICAL_TRANSITION/);
 check(prepared,record(prepared,'COMMITTED',2),/MIO_LOGICAL_TRANSITION/);
 check(prepared,record(prepared,'EXECUTING',3),/MIO_LOGICAL_TRANSITION/);
 check(prepared,record(prepared,'EXECUTING',2,{previousDigest:null}),/MIO_LOGICAL_PREVIOUS/);
 check(blank,record(blank,'PREPARED',1,{requestId:123}),/MIO_LOGICAL_SCHEMA/);
 check(blank,record(blank,'PREPARED',1,{unexpected:true}),/MIO_LOGICAL_SCHEMA/);
 const uncertain=record(prepared,'UNCERTAIN',2);check(prepared,uncertain);
 const reviewed=Buffer.concat([prepared,uncertain]);check(reviewed,record(reviewed,'EXECUTING',3),/MIO_LOGICAL_TRANSITION/);
 console.log(JSON.stringify({probe:'PRV-11.04c',positiveCases:4,negativeCases:7,productionReady:false}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
