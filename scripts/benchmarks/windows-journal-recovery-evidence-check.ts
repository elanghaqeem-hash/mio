import assert from 'node:assert/strict';
import { encodeJournalRecord, decodeJournalRecords } from '../../src/observability/WindowsJournalBinaryCodec';
import { inspectRecoveryEvidence } from '../../src/observability/WindowsJournalRecoveryEvidence';
const id={projectId:'projectA',taskId:'taskA',requestId:'requestA'};
let bytes=Buffer.alloc(0);
function add(phase:string,sequence:number){
 const state=decodeJournalRecords(bytes);
 const event=JSON.stringify({version:1,...id,phase,sequence,previousDigest:state.entries.at(-1)?.digest??null});
 bytes=Buffer.concat([bytes,encodeJournalRecord(event,state.lastHash,state.size).record]);
}
function check(input:Buffer,status:string,recordedState:string|null){
 const before=Buffer.from(input);
 const result=inspectRecoveryEvidence(input,id);
 assert.equal(result.status,status);assert.equal(result.recordedState,recordedState);
 assert.equal(result.automaticReplayPermitted,false);assert.equal(result.lockReleasePermitted,false);assert.equal(result.runtimeActivationPermitted,false);
 assert.deepEqual(input,before);
 return result;
}
check(bytes,'REVIEW_REQUIRED','NOT_FOUND');
add('PREPARED',1);check(bytes,'REVIEW_REQUIRED','REVIEW_REQUIRED');
add('EXECUTING',2);check(bytes,'REVIEW_REQUIRED','REVIEW_REQUIRED');
add('COMMITTED',3);const committed=check(bytes,'REVIEW_REQUIRED','LOGICALLY_COMMITTED');assert.match(committed.journalSha256??'',/^[a-f0-9]{64}$/);
const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;check(corrupt,'INVALID_HISTORY',null);
check(bytes.subarray(0,-1),'INVALID_HISTORY',null);
add('PREPARED',4);check(bytes,'INVALID_HISTORY',null);
check(Buffer.alloc(8388609),'INVALID_HISTORY',null);
console.log(JSON.stringify({probe:'PRV-11.04h',cases:8,productionReady:false}));
