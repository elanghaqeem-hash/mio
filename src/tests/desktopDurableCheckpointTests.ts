import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DesktopDurableMutationCheckpoints } from '../../electron/ipc/durableMutationCheckpoints';
const assert = (x: unknown, m: string): void => { if (!x) throw new Error(m); };
const rejects = (f: () => void, m: string): void => { let failed = false; try { f(); } catch { failed = true; } assert(failed, m); };
export function runDesktopDurableCheckpointTests(): { passed: number; total: number } {
  const checks: Array<[string, () => void]> = [
    ['restart treats incomplete execution as UNCERTAIN, committed stays committed', () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-ckpt-'));
      try {
        const s = new DesktopDurableMutationCheckpoints(home);
        s.reserve('ws_1', 'tx_1', ['op_1', 'op_2']);
        s.transition('ws_1', 'tx_1', 'op_1', 'EXECUTING');
        s.transition('ws_1', 'tx_1', 'op_1', 'COMMITTED');
        s.transition('ws_1', 'tx_1', 'op_2', 'EXECUTING');
        const resumed = new DesktopDurableMutationCheckpoints(home).inspect('ws_1');
        assert(resumed.length === 2 && resumed[0].state === 'COMMITTED' && resumed[1].state === 'UNCERTAIN', 'restart safety failed');
      } finally { fs.rmSync(home, { recursive: true, force: true }); }
    }],
    ['duplicate transactions, invalid IDs and transitions fail closed', () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-ckpt-'));
      try {
        const s = new DesktopDurableMutationCheckpoints(home);
        s.reserve('ws_1', 'tx_1', ['op_1']);
        rejects(() => s.reserve('ws_1', 'tx_1', ['op_2']), 'replayed transaction');
        rejects(() => s.reserve('ws_1', '../escape', ['op_2']), 'malformed identifier');
        rejects(() => s.transition('ws_1', 'tx_1', 'op_1', 'COMMITTED'), 'skipped execution state');
        assert(s.inspect('ws_2').length === 0, 'cross-workspace leak');
      } finally { fs.rmSync(home, { recursive: true, force: true }); }
    }],
    ['corrupt archives and unexpected fields block new work', () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-ckpt-'));
      try {
        const s = new DesktopDurableMutationCheckpoints(home);
        s.reserve('ws_1', 'tx_1', ['op_1']);
        const directory = path.join(home, 'mutation-checkpoints-v1');
        const filename = path.join(directory, fs.readdirSync(directory)[0]);
        const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
        raw.records[0].apiKey = 'must-not-persist';
        fs.writeFileSync(filename, JSON.stringify(raw));
        rejects(() => s.reserve('ws_1', 'tx_2', ['op_2']), 'corruption was accepted');
        rejects(() => s.inspect('ws_1'), 'corruption silently reset');
      } finally { fs.rmSync(home, { recursive: true, force: true }); }
    }],
    ['read-only recovery assessment distinguishes committed, uncertain, and prepared operations', () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-recovery-'));
      try {
        const store = new DesktopDurableMutationCheckpoints(home);
        store.reserve('ws_1', 'tx_1', ['one', 'two', 'three']);
        store.transition('ws_1', 'tx_1', 'one', 'EXECUTING');
        store.transition('ws_1', 'tx_1', 'one', 'COMMITTED');
        store.transition('ws_1', 'tx_1', 'two', 'EXECUTING');
        const inspection = new DesktopDurableMutationCheckpoints(home).inspectRecovery('ws_1');
        assert(inspection.summary.total === 3 && inspection.summary.completed === 1 &&
          inspection.summary.needsReview === 1 && inspection.summary.notStarted === 1, 'recovery categories are wrong');
        assert(inspection.checkpoints[1].state === 'UNCERTAIN' &&
          inspection.checkpoints[1].recoveryDecision === 'MANUAL_REVIEW_REQUIRED', 'in-flight mutation could auto-replay');
        assert(inspection.checkpoints[2].recoveryDecision === 'NOT_STARTED_REVIEW', 'prepared action was auto-approved');
        assert(inspection.disclosure === 'READ_ONLY_NO_AUTOMATIC_REPLAY', 'read-only disclosure missing');
        assert(!JSON.stringify(inspection).includes('source'), 'sensitive path exposed');
        assert(store.inspect('ws_1')[1].state === 'UNCERTAIN', 'inspection changed saved record');
      } finally { fs.rmSync(home, { recursive: true, force: true }); }
    }],
    ['checkpoint files contain only opaque metadata and no operation paths', () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-ckpt-'));
      try {
        const s = new DesktopDurableMutationCheckpoints(home);
        s.reserve('ws_1', 'tx_1', ['op_1']);
        const directory = path.join(home, 'mutation-checkpoints-v1');
        const filename = path.join(directory, fs.readdirSync(directory)[0]);
        const data = fs.readFileSync(filename, 'utf8');
        assert(!data.includes('source') && !data.includes('target') && !data.includes('prompt'), 'sensitive metadata stored');
        assert(fs.statSync(filename).size > 0, 'checkpoint not persisted');
      } finally { fs.rmSync(home, { recursive: true, force: true }); }
    }],
  ];
  let passed = 0;
  for (const [name, run] of checks) { run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: checks.length };
}
