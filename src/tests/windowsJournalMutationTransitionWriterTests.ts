import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WindowsJournalMutationTransitionWriter } from '../observability/WindowsJournalMutationTransitionWriter';
import { WindowsCheckpointJournalPrototype } from '../observability/WindowsCheckpointJournalPrototype';
const identity = { projectId: 'project_1', taskId: 'task_1', requestId: 'req_1' };
const other = { ...identity, requestId: 'req_2' };
const check = (yes: unknown, why: string) => { if (!yes) throw Error(why); };
const denied = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
function fixture(run: (filename: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-journal-transition-'));
  try {
    const filename = path.join(dir, 'provisioned.journal');
    fs.writeFileSync(filename, Buffer.alloc(0), { flag: 'wx' });
    run(filename);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
export async function runWindowsJournalMutationTransitionWriterTests(): Promise<{ passed: number; total: number }> {
  const cases: Array<[string, () => void]> = [
    ['logical PREPARED/EXECUTING/COMMITTED commits with correct chain and restart review', () => fixture(filename => {
      const writer = new WindowsJournalMutationTransitionWriter(filename);
      writer.append(identity, 'PREPARED');
      writer.append(identity, 'EXECUTING');
      writer.append(identity, 'COMMITTED');
      check(writer.review(identity).status === 'LOGICALLY_COMMITTED', 'missing logical commit');
      check(denied(() => writer.append(identity, 'PREPARED')), 'replay accepted');
      writer.close();
      const restarted = new WindowsJournalMutationTransitionWriter(filename);
      check(restarted.review(identity).status === 'LOGICALLY_COMMITTED', 'restart lost logical state');
      check(denied(() => restarted.append(identity, 'EXECUTING')), 'restart replay accepted');
      restarted.close();
    })],
    ['interleaved projects share one global previousDigest chain', () => fixture(filename => {
      const writer = new WindowsJournalMutationTransitionWriter(filename);
      writer.append(identity, 'PREPARED');
      writer.append(other, 'PREPARED');
      writer.append(identity, 'EXECUTING');
      writer.append(other, 'UNCERTAIN');
      check(writer.review(other).status === 'REVIEW_REQUIRED', 'uncertain mutation misreported');
      writer.append(identity, 'COMMITTED');
      check(writer.review(identity).status === 'LOGICALLY_COMMITTED', 'interleaved commit rejected');
      writer.close();
    })],
    ['invalid phases, skipped transitions and duplicate requests do not write records', () => fixture(filename => {
      const writer = new WindowsJournalMutationTransitionWriter(filename);
      check(denied(() => writer.append(identity, 'COMMITTED')), 'commit without preparation');
      check(denied(() => writer.append(identity, 'EXECUTING')), 'execution without preparation');
      check(denied(() => writer.append({ ...identity, projectId: '../bad' }, 'PREPARED')), 'invalid identity');
      check(denied(() => writer.append(identity, 'SUSPENDED' as 'PREPARED')), 'invalid phase');
      check(writer.review(identity).status === 'NOT_FOUND', 'invalid records admitted');
      writer.append(identity, 'PREPARED');
      check(denied(() => writer.append(identity, 'PREPARED')), 'duplicate prepare admitted');
      check(new WindowsCheckpointJournalPrototype(filename).inspect().length === 1, 'invalid append changed history');
      writer.close();
    })],
    ['existing malformed logical history quarantines lock without silent repair', () => fixture(filename => {
      const journal = new WindowsCheckpointJournalPrototype(filename);
      journal.append(JSON.stringify({version:1,...identity,sequence:1,phase:'COMMITTED',previousDigest:null}));
      check(denied(() => new WindowsJournalMutationTransitionWriter(filename)), 'invalid history accepted');
      check(fs.existsSync(filename + '.writer.lock'), 'quarantined lock removed');
      check(denied(() => new WindowsJournalMutationTransitionWriter(filename)), 'quarantined history reopened');
    })],
    ['logical UNCERTAIN is terminal and never automatically replayed', () => fixture(filename => {
      const writer = new WindowsJournalMutationTransitionWriter(filename);
      writer.append(identity, 'PREPARED');
      writer.append(identity, 'UNCERTAIN');
      check(writer.review(identity).status === 'REVIEW_REQUIRED', 'uncertain marked committed');
      check(denied(() => writer.append(identity, 'EXECUTING')), 'uncertain replay accepted');
      writer.close();
    })],
  ];
  let passed = 0;
  for (const [name, run] of cases) { run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: cases.length };
}
