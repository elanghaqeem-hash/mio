import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const assert = (yes: unknown, reason: string): void => { if (!yes) throw Error(reason); };
const script = path.resolve('src/tests/helpers/windowsJournalWriterChild.ts');
const childArgs = (file: string, mode: string) => ['--import','tsx',script,file,mode];

export async function runWindowsJournalInterprocessTests(): Promise<{passed:number;total:number}> {
  const tests: Array<[string,()=>Promise<void>]> = [
    ['independent OS writer contention and orderly release', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(),'mio-writer-process-'));
      const file = path.join(root,'journal.bin');
      fs.writeFileSync(file,Buffer.alloc(0),{flag:'wx'});
      const holder = spawn(process.execPath,childArgs(file,'hold'), {stdio:['pipe','pipe','pipe']});
      try {
        await new Promise<void>((resolve,reject) => {
          let output='';
          const guard=setTimeout(()=>reject(Error('LOCK_READY_TIMEOUT')),10000);
          holder.on('error',reject);
          holder.on('exit',(code)=>reject(Error('HOLDER_EXIT_EARLY_'+code)));
          holder.stdout.on('data',(part: Buffer) => {
            output+=part.toString('utf8');
            if (output.includes('LOCK_HELD')) { clearTimeout(guard);resolve(); }
          });
        });
        const conflict=spawnSync(process.execPath,childArgs(file,'contend'),{encoding:'utf8',timeout:12000});
        assert(conflict.status===75,'competing OS process acquired writer lock');
        holder.stdin.write('release\n');
        const code=await new Promise<number|null>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('HOLDER_CLOSE_TIMEOUT')),10000);
          holder.once('exit',(status)=>{clearTimeout(timer);resolve(status);});
        });
        assert(code===0,'holder did not gracefully release');
        const resumed=spawnSync(process.execPath,childArgs(file,'contend'),{encoding:'utf8',timeout:12000});
        assert(resumed.status===0,'exclusive writer lock not released after orderly exit: '+resumed.stderr);
      } finally {
        if (holder.exitCode===null) holder.kill();
        fs.rmSync(root,{recursive:true,force:true});
      }
    }],
    ['abrupt OS exit leaves stale lock and denies takeover', async () => {
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-writer-process-'));
      const file=path.join(root,'journal.bin');
      try {
        fs.writeFileSync(file,Buffer.alloc(0),{flag:'wx'});
        const crashed=spawnSync(process.execPath,childArgs(file,'crash'),{encoding:'utf8',timeout:12000});
        assert(crashed.status===77,'crash marker mismatch: '+crashed.stderr);
        assert(fs.existsSync(file+'.writer.lock'),'crashed process lock disappeared');
        const contender=spawnSync(process.execPath,childArgs(file,'contend'),{encoding:'utf8',timeout:12000});
        assert(contender.status===75,'stale lock was automatically reclaimed');
      } finally { fs.rmSync(root,{recursive:true,force:true}); }
    }],
  ];
  let passed=0;
  for (const [name,run] of tests) {await run();passed++;console.log('✓ [PASS] '+name);}
  return {passed,total:tests.length};
}
