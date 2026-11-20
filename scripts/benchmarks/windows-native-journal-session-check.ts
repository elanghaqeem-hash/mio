import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { encodeJournalRecord, decodeJournalRecords } from '../../src/observability/WindowsJournalBinaryCodec';
assert.equal(process.platform,'win32');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-native-session-'));
try {
 const file=path.join(root,'journal'), fixture=path.join(root,'record');
 const first=encodeJournalRecord('{"phase":"PREPARED"}',Buffer.alloc(32),0);
 const second=encodeJournalRecord('{"phase":"EXECUTING"}',first.digest,first.record.length);
 const run=()=>spawnSync('pwsh',['-NoProfile','-File','scripts/benchmarks/windows-native-journal-session.ps1',file,fixture],{encoding:'utf8',timeout:30000});
 const check=(prior:Buffer,candidate:Buffer,expectedError?:RegExp)=>{
  fs.writeFileSync(file,prior);fs.writeFileSync(fixture,candidate);
  const result=run();assert.ifError(result.error);
  if(expectedError){assert.notEqual(result.status,0);assert.match(result.stderr,expectedError);assert.deepEqual(fs.readFileSync(file),prior);}
  else {assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readFileSync(file),Buffer.concat([prior,candidate]));assert.equal(decodeJournalRecords(fs.readFileSync(file)).entries.length,2);}
 };
 check(first.record,second.record);
 const corrupt=Buffer.from(first.record);corrupt[corrupt.length-1]^=1;
 check(corrupt,second.record,/MIO_HASH/);
 check(first.record.subarray(0,-1),second.record,/MIO_LENGTH/);
 check(first.record,first.record,/MIO_HASH/);
 const next=encodeJournalRecord('{"phase":"COMMITTED"}',second.digest,first.record.length+second.record.length);
 check(first.record,Buffer.concat([second.record,next.record]),/MIO_RECORD_COUNT/);
 console.log(JSON.stringify({probe:'PRV-11.04b',validAppend:'pass',negativeCases:4,productionReady:false}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
