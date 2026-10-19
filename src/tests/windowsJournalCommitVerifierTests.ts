import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WindowsCheckpointJournalPrototype } from '../observability/WindowsCheckpointJournalPrototype';
import { inspectJournalMutationCommit, type JournalMutationPhase } from '../observability/WindowsJournalCommitVerifier';

const identity={projectId:'ws_1',taskId:'task_1',requestId:'req_1'};
const check=(value:unknown,message:string)=>{if(!value)throw Error(message);};
function fixture(run:(journal:WindowsCheckpointJournalPrototype)=>void):void {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-commit-verify-'));
  try {
    const name=path.join(root,'preprovisioned.journal');
    fs.writeFileSync(name,Buffer.alloc(0),{flag:'wx'});
    run(new WindowsCheckpointJournalPrototype(name));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
const event=(sequence:number,phase:JournalMutationPhase,previousDigest:string|null,requestId='req_1') =>
  JSON.stringify({version:1,...identity,requestId,sequence,phase,previousDigest});
const reject=(fn:()=>unknown):boolean=>{try{fn();return false;}catch{return true;}};
export async function runWindowsJournalCommitVerifierTests():Promise<{passed:number;total:number}> {
 const tests:Array<[string,()=>void]>=[
  ['three durable-file records yield logical commit after reopen, not power-loss proof',()=>{
    fixture(j=>{
      const prepared=j.append(event(1,'PREPARED',null));
      const running=j.append(event(2,'EXECUTING',prepared.digest));
      j.append(event(3,'COMMITTED',running.digest));
      const result=inspectJournalMutationCommit(j.inspect(),identity);
      check(result.status==='LOGICALLY_COMMITTED'&&result.records===3,'logical commit missing');
    });
  }],
  ['interrupted execution never reports committed or automatic retry',()=>{
    fixture(j=>{
      const prepared=j.append(event(1,'PREPARED',null));
      j.append(event(2,'EXECUTING',prepared.digest));
      const result=inspectJournalMutationCommit(j.inspect(),identity);
      check(result.status==='REVIEW_REQUIRED'&&result.lastPhase==='EXECUTING','interrupted effect misreported');
    });
  }],
  ['missing identity cannot inherit commit from another request',()=>{
    fixture(j=>{
      j.append(event(1,'PREPARED',null,'another'));
      check(inspectJournalMutationCommit(j.inspect(),identity).status==='NOT_FOUND','cross-request commit leaked');
    });
  }],
  ['skipped state and forged digest transition are rejected',()=>{
    fixture(j=>{
      const prepared=j.append(event(1,'PREPARED',null));
      j.append(event(2,'COMMITTED',prepared.digest));
      check(reject(()=>inspectJournalMutationCommit(j.inspect(),identity)),'skipped EXECUTING admitted');
    });
    fixture(j=>{
      j.append(event(1,'PREPARED',null));
      j.append(event(2,'EXECUTING','0'.repeat(64)));
      check(reject(()=>inspectJournalMutationCommit(j.inspect(),identity)),'foreign digest admitted');
    });
  }],
  ['committed requests cannot be replayed by recording more phases',()=>{
    fixture(j=>{
      const prepared=j.append(event(1,'PREPARED',null));
      const running=j.append(event(2,'EXECUTING',prepared.digest));
      const committed=j.append(event(3,'COMMITTED',running.digest));
      j.append(event(4,'PREPARED',committed.digest));
      check(reject(()=>inspectJournalMutationCommit(j.inspect(),identity)),'committed history replayed');
    });
  }],
  ['torn or corrupted underlying journal is never converted to safe logical success',()=>{
    fixture(j=>{
      j.append(event(1,'PREPARED',null));
      const file=(j as unknown as {filename:string}).filename;
      fs.appendFileSync(file,Buffer.from([0x1,0x2,0x3]));
      check(reject(()=>j.inspect()),'torn journal accepted');
    });
  }],
 ];
 let passed=0;
 for(const [name,run] of tests){run();passed++;console.log('✓ [PASS] '+name);}
 return {passed,total:tests.length};
}
