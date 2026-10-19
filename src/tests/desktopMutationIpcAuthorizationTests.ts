import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorkspaceSandbox } from '../../electron/ipc/workspaceSandbox';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
export async function runDesktopMutationIpcAuthorizationTests(): Promise<{ passed: number; total: number }> {
  const source = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  const handlers = fs.readFileSync(path.resolve('electron/ipc/handlers.ts'), 'utf8');
  const tests: Array<[string, () => Promise<void>]> = [
    ['mutating approval and audit channels are registered through trusted IPC', async () => {
      for (const channel of ['FS_REQUEST_WORKSPACE_MUTATION_APPROVAL', 'FS_LIST_WORKSPACE_MUTATION_AUDIT']) {
        assert(source.includes('secureHandle(IPC_CHANNELS.' + channel + ','), 'unregistered secure channel: ' + channel);
      }
    }],
    ['mutating approval/audit/execution refuse unknown workspace authorization', async () => {
      for (const name of ['handleListWorkspaceMutationAudit', 'handleRequestWorkspaceMutationApproval', 'handleExecuteWorkspaceMutation']) {
        const from = handlers.indexOf(name + ':');
        assert(from !== -1, 'missing handler ' + name);
        const until = handlers.indexOf('\n    },', from);
        const block = handlers.slice(from, until !== -1 ? until : from + 3000);
        assert(block.includes('isAuthorizedWorkspace(') && block.includes('Workspace authorization required'), name + ' lacks authorization gate');
      }
    }],
    ['workspace authority requires explicit authorization and is revoked', async () => {
      const sandbox = new WorkspaceSandbox();
      assert(sandbox.listAuthorized().length === 0, 'initial workspace authority exists');
      const item = await sandbox.authorizeRoot(process.cwd());
      assert(sandbox.listAuthorized().some(workspace => workspace.id === item.id), 'workspace not authorized');
      sandbox.revoke(item.id);
      assert(!sandbox.listAuthorized().some(workspace => workspace.id === item.id), 'workspace remained authorized');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
