import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WindowsCheckpointJournalPrototype } from '../observability/WindowsCheckpointJournalPrototype';

const check = (ok: unknown, why: string): void => { if (!ok) throw Error(why); };
function denied(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}
export async function runWindowsCheckpointJournalPrototypeTests(): Promise<{passed: number; total: number}> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['preprovisioned file only: cannot silently create checkpoint directory or file', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-probe-'));
      try {
        const filename = path.join(root,'missing.journal');
        const journal = new WindowsCheckpointJournalPrototype(filename);
        check(denied(() => journal.append('{"state":"PREPARED"}')), 'unexpected file creation');
        check(!fs.existsSync(filename), 'unprovisioned journal created');
      } finally { fs.rmSync(root,{recursive:true,force:true}); }
    }],
    ['append, file flush, restart and two-record chained audit survive', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-probe-'));
      try {
        const filename = path.join(root,'preprovisioned.journal');
        fs.writeFileSync(filename,Buffer.alloc(0),{flag:'wx',mode:0o600});
        const journal = new WindowsCheckpointJournalPrototype(filename);
        journal.append('{"state":"PREPARED","id":"one"}');
        journal.append('{"state":"EXECUTING","id":"one"}');
        const reopened = new WindowsCheckpointJournalPrototype(filename).inspect();
        check(reopened.length===2 && reopened[0].offset===0 &&
          reopened[1].json.includes('EXECUTING') && reopened[0].digest!==reopened[1].digest,
          'records not recovered in order');
      } finally { fs.rmSync(root,{recursive:true,force:true}); }
    }],
    ['corrupted history denies append and replay, never silently resets', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-probe-'));
      try {
        const filename = path.join(root,'preprovisioned.journal');
        fs.writeFileSync(filename,Buffer.alloc(0),{flag:'wx'});
        const journal = new WindowsCheckpointJournalPrototype(filename);
        journal.append('{"state":"PREPARED"}');
        const bytes = fs.readFileSync(filename);
        bytes[bytes.length-3] ^= 1;
        fs.writeFileSync(filename,bytes);
        const before=fs.statSync(filename).size;
        check(denied(() => journal.inspect()) && denied(() => journal.append('{"state":"COMMITTED"}')),
          'corruption accepted');
        check(fs.statSync(filename).size===before,'corrupt history overwritten');
      } finally { fs.rmSync(root,{recursive:true,force:true}); }
    }],
    ['torn tail and invalid JSON are strictly rejected', async () => {
      const root=fs.mkdtempSync(path.join(os.tmpdir(),'mio-journal-probe-'));
      try {
        const filename=path.join(root,'preprovisioned.journal');
        fs.writeFileSync(filename,Buffer.alloc(0),{flag:'wx'});
        const journal=new WindowsCheckpointJournalPrototype(filename);
        check(denied(()=>journal.append('not json')),'invalid JSON accepted');
        journal.append('{"state":"PREPARED"}');
        fs.appendFileSync(filename,Buffer.from([1,2,3]));
        check(denied(()=>journal.inspect()) && denied(()=>journal.append('{"state":"COMMITTED"}')),'torn append auto-recovered');
      } finally {fs.rmSync(root,{recursive:true,force:true});}
    }],
  ];
  let passed=0;
  for(const [name,run] of tests){await run();passed++;console.log('✓ [PASS] '+name);}
  return {passed,total:tests.length};
}
