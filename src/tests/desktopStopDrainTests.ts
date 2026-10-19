import * as fs from 'node:fs';
import * as path from 'node:path';

const check = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
export async function runDesktopStopDrainTests(): Promise<{ passed: number; total: number }> {
  const main = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  const handlers = fs.readFileSync(path.resolve('electron/ipc/handlers.ts'), 'utf8');
  const tests: Array<[string, () => void]> = [
    ['IPC STOP latches mutations and clears pending approvals', () => {
      const area = handlers.slice(handlers.indexOf('handleEmergencyStop:'), handlers.indexOf('handleAuthorizeWorkspace:'));
      check(area.includes('desktopMutationStopped = true') && area.includes('mutationApprovals.clear()'), 'STOP does not revoke pending approvals');
    }],
    ['approval dialog checks STOP and workspace authority again after await', () => {
      const area = handlers.slice(handlers.indexOf('handleRequestWorkspaceMutationApproval:'), handlers.indexOf('handleExecuteWorkspaceMutation:'));
      check(area.includes("if (desktopMutationStopped || !isAuthorizedWorkspace(value.transaction.workspaceId))"), 'late dialog approval bypasses STOP or revoked authority');
    }],
    ['STOP blocks remaining operations without declaring complete', () => {
      const area = handlers.slice(handlers.indexOf('const handleExecuteMutation ='), handlers.indexOf('const mutationDispatcher ='));
      check(area.includes('for (const operation of transaction.operations)') &&
        area.includes("state:'STOPPED_PARTIAL'") && area.includes("state: 'FAILED', error: 'STOP_MIO'") &&
        area.indexOf("state:'STOPPED_PARTIAL'") < area.indexOf('durableCheckpoints.transition(transaction.workspaceId, transaction.id, operation.id, \'EXECUTING\')'), 'STOP continuation protection missing');
    }],
    ['tray STOP and process quit guard active mutation', () => {
      check(main.includes('requestStopWorkspaceMutations?.()') &&
        main.includes("app.on('before-quit', event =>") &&
        main.includes('event.preventDefault()') &&
        main.includes('handlers.hasActiveWorkspaceMutations()'), 'main process can quit in-flight');
    }],
    ['window close and IPC quit cannot revoke active writer', () => {
      check(main.includes("mainWindow.on('close', event =>") &&
        main.includes("WORKSPACE_MUTATION_DRAIN_REQUIRED") &&
        handlers.includes("handleClose: () => {\n      if (workspaceMutationLease.hasActive() || creativeBusy())"), 'window close bypasses workspace mutation lease');
    }],
  ];
  let passed = 0;
  for (const [label, fn] of tests) { fn(); passed++; console.log('✓ [PASS] ' + label); }
  return { passed, total: tests.length };
}
