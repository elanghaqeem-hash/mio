import { DesktopReadOnlyCapabilityBridge } from '../../electron/ipc/readOnlyCapabilityBridge';
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
export async function runDesktopReadCapabilityBridgeTests(): Promise<{ passed: number; total: number }> {
  let authorized = true, stopped = false, reads = 0;
  const bridge = new DesktopReadOnlyCapabilityBridge({
    authorized: () => authorized,
    stopped: () => stopped,
    list: async () => { reads++; return [{ name: 'file.txt', type: 'FILE' }]; },
    readText: async () => { reads++; return { data: 'example', bytes: 7 }; },
    inspectRecovery: () => ({ summary: { needsReview: 1 } }),
  });
  const base = { schemaVersion: 1, workspaceId: 'ws_123', permissionLevel: 'L0_OBSERVE' };
  const tests: Array<[string, () => Promise<void>]> = [
    ['read-only allowlist returns expected workspace metadata', async () => {
      const outcome = await bridge.invoke({ ...base, capabilityId: 'desktop.workspace.list', relativePath: '.' });
      assert(outcome.success && outcome.capabilityId === 'desktop.workspace.list', 'list failed');
      const recovery = await bridge.invoke({ ...base, capabilityId: 'desktop.recovery.inspect' });
      assert(recovery.success, 'recovery inspect failed');
    }],
    ['mutation and mismatched permissions are denied without execution', async () => {
      const before = reads;
      const mutation = await bridge.invoke({ ...base, capabilityId: 'creative.execute', relativePath: '.' });
      const privileged = await bridge.invoke({ ...base, capabilityId: 'desktop.workspace.list', permissionLevel: 'L4_EXECUTE', relativePath: '.' });
      const extra = await bridge.invoke({ ...base, capabilityId: 'desktop.workspace.list', relativePath: '.', approvalToken: 'secret' });
      assert(!mutation.success && !privileged.success && !extra.success && before === reads, 'unsafe capability admitted');
    }],
    ['workspace authorization and STOP block reads', async () => {
      authorized = false;
      let response = await bridge.invoke({ ...base, capabilityId: 'desktop.workspace.read-text', relativePath: 'file.txt' });
      assert(!response.success, 'unauthorized read succeeded');
      authorized = true; stopped = true;
      response = await bridge.invoke({ ...base, capabilityId: 'desktop.workspace.read-text', relativePath: 'file.txt' });
      assert(!response.success, 'STOP bypassed');
      stopped = false;
    }],
    ['revocation while asynchronous IO is pending suppresses success', async () => {
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      const guarded = new DesktopReadOnlyCapabilityBridge({
        authorized: () => authorized, stopped: () => stopped,
        list: async () => { await pending; return []; },
        readText: async () => ({ data: '', bytes: 0 }),
        inspectRecovery: () => ({}),
      });
      const operation = guarded.invoke({ ...base, capabilityId: 'desktop.workspace.list', relativePath: '.' });
      authorized = false; release();
      const result = await operation;
      assert(!result.success, 'revoked workspace response leaked');
      authorized = true;
    }],
    ['malformed requests do not dispatch', async () => {
      const invalid = [null, [], { ...base, capabilityId: 'desktop.workspace.list' },
        { ...base, capabilityId: 'desktop.recovery.inspect', relativePath: '.' },
        { ...base, capabilityId: 'desktop.workspace.list', relativePath: 'x'.repeat(4097) },
        { ...base, workspaceId: 'ws_../', capabilityId: 'desktop.workspace.list', relativePath: '.' }];
      for (const request of invalid) assert(!(await bridge.invoke(request)).success, 'invalid envelope accepted');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
