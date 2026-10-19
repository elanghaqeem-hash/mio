import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WindowsJournalWriterPrototype } from '../observability/WindowsJournalWriterPrototype';

const insist = (yes: unknown, reason: string) => { if (!yes) throw Error(reason); };
const denied = (fn: () => unknown) => { try {fn();return false;}catch{return true;} };
export async function runWindowsJournalWriterPrototypeTests(): Promise<{passed:number;total:number}> {
  const checks: Array<[string,()=>Promise<void>]> = [
    ['one writer holds exclusive lock until orderly close', async () => {
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-win-writer-'));
      try {
        const pathname=path.join(root,'journal.bin');
        fs.writeFileSync(pathname,Buffer.alloc(0),{flag:'wx'});
        const first=new WindowsJournalWriterPrototype(pathname);
        insist(denied(()=>new WindowsJournalWriterPrototype(pathname)), 'second writer acquired same lock');
        first.append('{"state":"PREPARED"}');
        insist(first.inspect().length===1,'checkpoint record missing');
        first.close();
        insist(!fs.existsSync(pathname+'.writer.lock'),'orderly lock not released');
        const second=new WindowsJournalWriterPrototype(pathname);
        second.append('{"state":"EXECUTING"}');
        insist(second.inspect().length===2,'second process view missing prior record');
        second.close();
      } finally {fs.rmSync(root,{recursive:true,force:true});}
    }],
    ['a stale lock is never automatically reclaimed', async () => {
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-win-writer-'));
      try {
        const pathname=path.join(root,'journal.bin');
        fs.writeFileSync(pathname,Buffer.alloc(0),{flag:'wx'});
        fs.writeFileSync(pathname+'.writer.lock','{"pid":-1}',{flag:'wx'});
        insist(denied(()=>new WindowsJournalWriterPrototype(pathname)),'stale lock stolen');
        insist(fs.existsSync(pathname+'.writer.lock'),'stale lock unexpectedly removed');
      } finally {fs.rmSync(root,{recursive:true,force:true});}
    }],
    ['torn journal quarantines the writer lock without repair', async () => {
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-win-writer-'));
      try {
        const pathname=path.join(root,'journal.bin');
        fs.writeFileSync(pathname,Buffer.from([1,2,3]),{flag:'wx'});
        insist(denied(()=>new WindowsJournalWriterPrototype(pathname)),'corrupt journal accepted');
        insist(fs.existsSync(pathname+'.writer.lock'),'quarantined lock reclaimed');
        insist(denied(()=>new WindowsJournalWriterPrototype(pathname)),'quarantined history reopened');
      } finally {fs.rmSync(root,{recursive:true,force:true});}
    }],
    ['failed append quarantines lock and disallows retry/close', async () => {
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-win-writer-'));
      try {
        const pathname=path.join(root,'journal.bin');
        fs.writeFileSync(pathname,Buffer.alloc(0),{flag:'wx'});
        const writer=new WindowsJournalWriterPrototype(pathname);
        insist(denied(()=>writer.append('invalid JSON')), 'bad payload admitted');
        insist(denied(()=>writer.append('{"state":"PREPARED"}')) && denied(()=>writer.close()),
          'failed journal write permitted subsequent operation or release');
        insist(fs.existsSync(pathname+'.writer.lock'),'uncertain writer lock removed');
      } finally {fs.rmSync(root,{recursive:true,force:true});}
    }],
  ];
  let passed=0;
  for(const [name,run] of checks){await run();passed++;console.log('✓ [PASS] '+name);}
  return {passed,total:checks.length};
}
