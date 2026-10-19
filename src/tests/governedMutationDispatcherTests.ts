import { GovernedDesktopMutationDispatcher } from '../../electron/ipc/governedMutationDispatcher';
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
export async function runGovernedMutationDispatcherTests(): Promise<{ passed: number; total: number }> {
  let calls = 0, authorized = true, stopped = false, response = { success: true, receipt: { state: 'COMPLETED' } };
  const dispatcher = new GovernedDesktopMutationDispatcher({
    authorized: () => authorized,
    stopped: () => stopped,
    execute: async () => { calls++; return response; },
  });
  const transaction = { id: 'tx_1', workspaceId: 'ws_123', operations: [{ id: 'op_1', kind: 'MKDIR', target: 'safe-folder', collisionPolicy: 'BLOCK' }] };
  const base = { schemaVersion: 1, capabilityId: 'desktop.workspace.execute-approved-mutation', permissionLevel: 'L3_MODIFY', transaction, approvalToken: 'a'.repeat(64) };
  const tests: Array<[string, () => Promise<void>]> = [
    ['validated approved mutation delegates once to governed executor', async () => {
      const result = await dispatcher.invoke(base);
      assert(result.success && calls === 1, 'valid dispatch not forwarded');
    }],
    ['reject malformed privilege, paths, operation IDs, tokens, and capability IDs', async () => {
      const before = calls;
      const bad = [
        {...base, permissionLevel: 'L0_OBSERVE'},
        {...base, capabilityId: 'creative.execute'},
        {...base, approvalToken: 'not-valid'},
        {...base, unexpected: true},
        {...base, transaction: {...transaction, operations: [{...transaction.operations[0], target: '../escape'}]}},
        {...base, transaction: {...transaction, operations: [{...transaction.operations[0], kind: 'EXEC'}]}},
        {...base, transaction: {...transaction, operations: [{...transaction.operations[0], id: 'op_1'}, {...transaction.operations[0], id: 'op_1'}]}},
      ];
      for (const value of bad) assert(!(await dispatcher.invoke(value)).success, 'invalid mutation accepted');
      assert(calls === before, 'malformed mutation delegated');
    }],
    ['destructive TRASH requires destructive permission level', async () => {
      const trash = { ...base, transaction: { ...transaction, operations: [{ id:'op_trash', kind:'TRASH', source:'test.txt', collisionPolicy:'BLOCK' }] } };
      const before = calls;
      assert(!(await dispatcher.invoke(trash)).success, 'TRASH permitted at L3');
      assert(calls === before, 'TRASH dispatched despite denied level');
      assert((await dispatcher.invoke({...trash, permissionLevel:'L5_DESTRUCTIVE'})).success, 'L5 TRASH should reach existing approval executor');
    }],
    ['STOP and workspace authorization are checked before invocation', async () => {
      const before = calls;
      stopped = true;
      assert(!(await dispatcher.invoke(base)).success, 'STOP bypassed');
      stopped = false; authorized = false;
      assert(!(await dispatcher.invoke(base)).success, 'unauthorized workspace dispatched');
      authorized = true;
      assert(calls === before, 'unsafe invocation reached executor');
    }],
    ['uncertain executor result and late STOP cannot be reported as safe success', async () => {
      response = { success: false, receipt: { state: 'UNCERTAIN' } };
      assert(!(await dispatcher.invoke(base)).success, 'executor failure reported success');
      response = { success: true, receipt: { state: 'COMPLETED' } };
      const late = new GovernedDesktopMutationDispatcher({
        authorized: () => true, stopped: () => stopped,
        execute: async () => { stopped = true; return response; },
      });
      const result = await late.invoke(base);
      assert(!result.success && result.error === 'CAPABILITY_MUTATION_COMMITTED_REVIEW_REQUIRED', 'late STOP incorrectly accepted success');
      stopped = false;
    }],
  ];
  let passed = 0;
  for (const [name, check] of tests) { await check(); passed++; console.log('✓ [PASS] '+name); }
  return { passed, total: tests.length };
}
