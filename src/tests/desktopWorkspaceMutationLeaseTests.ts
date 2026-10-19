import * as fs from 'node:fs';
import * as path from 'node:path';
import { DesktopWorkspaceMutationLease } from '../../electron/ipc/workspaceMutationLease';

const assert = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const rejects = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };

export async function runDesktopWorkspaceMutationLeaseTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['overlapping mutations in same workspace are denied immediately', async () => {
      const leases = new DesktopWorkspaceMutationLease();
      const release = leases.acquire('ws_one');
      assert(leases.isActive('ws_one'), 'lease not retained');
      assert(rejects(() => leases.acquire('ws_one')), 'overlapping mutation admitted');
      release();
      assert(!leases.isActive('ws_one'), 'lease remains active');
    }],
    ['unrelated workspace can mutate independently', async () => {
      const leases = new DesktopWorkspaceMutationLease();
      const first = leases.acquire('ws_one');
      const second = leases.acquire('ws_two');
      assert(leases.hasActive(), 'expected active leases');
      first();
      assert(leases.isActive('ws_two'), 'unrelated lease was released');
      second();
      assert(!leases.hasActive(), 'leases leaked');
    }],
    ['lease may be released only once and recycled after errors', async () => {
      const leases = new DesktopWorkspaceMutationLease();
      const release = leases.acquire('ws_one');
      try { throw new Error('simulated executor failure'); }
      catch { release(); }
      release();
      const recycled = leases.acquire('ws_one');
      recycled();
      assert(!leases.isActive('ws_one'), 'release is not idempotent');
    }],
    ['Electron execution holds lease with finally and revocation guard', async () => {
      const handler = fs.readFileSync(path.resolve('electron/ipc/handlers.ts'), 'utf8');
      const execution = handler.slice(handler.indexOf('const handleExecuteMutation ='), handler.indexOf('const mutationDispatcher ='));
      const revoke = handler.slice(handler.indexOf('handleRevokeWorkspace:'), handler.indexOf('handleReadWorkspaceText:'));
      assert(execution.includes('workspaceMutationLease.acquire(value.transaction.workspaceId)'), 'execution not protected');
      assert(execution.includes('finally { releaseWorkspace(); }'), 'lease not released on error');
      assert(revoke.includes('workspaceMutationLease.isActive(workspaceId)'), 'authority revocable while in flight');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
