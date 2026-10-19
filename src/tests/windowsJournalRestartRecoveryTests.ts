import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WindowsCheckpointJournalPrototype } from '../observability/WindowsCheckpointJournalPrototype';
import { WindowsJournalWriterPrototype } from '../observability/WindowsJournalWriterPrototype';
import { inspectJournalMutationCommit } from '../observability/WindowsJournalCommitVerifier';

const assert=(yes:unknown,why:string):void=>{if(!yes)throw Error(why);};
const request={projectId:'ws_restart',taskId:'task_restart',requestId:'req_restart'};
const script=path.resolve('src/tests/helpers/windowsJournalRestartChild.ts');
type Mode='before-prepared'|'after-prepared'|'after-executing'|'after-committed';
const codes:Record<Mode,number>={'before-prepared':71,'after-prepared':72,'after-executing':73,'after-committed':74};

function exercise(mode:Mode,expected:'NOT_FOUND'|'REVIEW_REQUIRED'|'LOGICALLY_COMMITTED',count:number) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-winjournal-restart-'));
 try {
  const filename=path.join(root,'existing.journal');
  fs.writeFileSync(filename,Buffer.alloc(0),{flag:'wx'});
  const result=spawnSync(process.execPath,['--import','tsx',script,filename,mode],
    {cwd:process.cwd(),encoding:'utf8',timeout:15000});
  assert(!result.error,'child spawn error: '+String(result.error));
  assert(result.status===codes[mode],'expected deliberate child death: '+mode+' '+result.status+' '+result.stderr);
  assert(fs.existsSync(filename+'.writer.lock'),'stale lock missing after process exit');
  const entries=new WindowsCheckpointJournalPrototype(filename).inspect();
  assert(entries.length===count,'checkpoint record count incorrect after '+mode);
  const report=inspectJournalMutationCommit(entries,request);
  assert(report.status===expected,'checkpoint falsely confirmed after '+mode);
  let denied=false;
  try { new WindowsJournalWriterPrototype(filename); }catch{denied=true;}
  assert(denied,'unreviewed writer takeover after '+mode);
  // No stale-lock removal or automatic replay, even when a logical COMMITTED record exists.
  const after=new WindowsCheckpointJournalPrototype(filename).inspect();
  assert(after.length===count,'journal modified during read-only recovery');
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
export async function runWindowsJournalRestartRecoveryTests():Promise<{passed:number,total:number}> {
 const tests:Array<[string,()=>void]>=[
  ['abrupt exit before PREPARED yields no record and stale lock',()=>exercise('before-prepared','NOT_FOUND',0)],
  ['abrupt exit after PREPARED requires review',()=>exercise('after-prepared','REVIEW_REQUIRED',1)],
  ['abrupt exit after EXECUTING requires review',()=>exercise('after-executing','REVIEW_REQUIRED',2)],
  ['abrupt exit after COMMITTED preserves logical commit but still quarantines crashed writer',()=>exercise('after-committed','LOGICALLY_COMMITTED',3)],
 ];
 let passed=0;
 for(const [name,run] of tests){run();passed++;console.log('✓ [PASS] '+name);}
 return {passed,total:tests.length};
}
