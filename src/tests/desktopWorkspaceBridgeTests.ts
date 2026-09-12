import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceSandbox } from '../../electron/ipc/workspaceSandbox';
import { createDefaultCapabilityRegistry, createDesktopCapabilityRegistry } from '../security/CapabilityRegistry';
import { createDesktopWorkspaceGateway, type DesktopWorkspaceBridge } from '../platform/desktop/DesktopWorkspaceGateway';

interface SuiteResult { passed: number; total: number; }

async function rejects(action: () => Promise<unknown>, includes?: string): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    if (!includes) return true;
    return error instanceof Error && error.message.toLowerCase().includes(includes.toLowerCase());
  }
}

export async function runDesktopWorkspaceBridgeTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`DesktopWorkspaceBridge test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mio-workspace-test-'));
  const root = path.join(base, 'authorized');
  const outside = path.join(base, 'outside');
  await fs.promises.mkdir(root, { recursive: true });
  await fs.promises.mkdir(outside, { recursive: true });
  await fs.promises.writeFile(path.join(root, 'notes.txt'), 'safe workspace text', 'utf-8');
  await fs.promises.writeFile(path.join(root, 'large.txt'), '12345', 'utf-8');
  await fs.promises.writeFile(path.join(outside, 'secret.txt'), 'outside secret', 'utf-8');
  await fs.promises.symlink(outside, path.join(root, 'escape-link'), 'dir');

  try {
    const sandbox = new WorkspaceSandbox();
    const workspace = await sandbox.authorizeRoot(root);
    check(/^ws_[a-zA-Z0-9-]+$/.test(workspace.id) && !('rootPath' in workspace), 'Authorized workspace returns an opaque id without exposing the absolute root');

    const safeRead = await sandbox.readText(workspace.id, 'notes.txt');
    check(safeRead.data === 'safe workspace text' && safeRead.bytes > 0, 'WorkspaceSandbox reads bounded text inside the authorized root');

    check(await rejects(() => sandbox.readText(workspace.id, path.join(outside, 'secret.txt')), 'absolute paths'), 'Absolute filesystem paths are rejected before workspace resolution');
    check(await rejects(() => sandbox.readText(workspace.id, '../outside/secret.txt'), 'escapes authorized workspace'), 'Parent traversal cannot escape the authorized workspace');
    check(await rejects(() => sandbox.readText(workspace.id, 'escape-link/secret.txt'), 'resolved path escapes'), 'Canonical realpath validation blocks symlink breakout');

    const boundedTextSandbox = new WorkspaceSandbox(4, 1000);
    const boundedWorkspace = await boundedTextSandbox.authorizeRoot(root);
    check(await rejects(() => boundedTextSandbox.readText(boundedWorkspace.id, 'large.txt'), 'bounded text-read limit'), 'Desktop text reads enforce a maximum byte budget');

    const boundedListSandbox = new WorkspaceSandbox(1024, 1);
    const listWorkspace = await boundedListSandbox.authorizeRoot(root);
    check(await rejects(() => boundedListSandbox.listDirectory(listWorkspace.id, '.'), 'bounded listing limit'), 'Directory listings enforce a maximum entry budget');

    check(sandbox.revoke(workspace.id) && await rejects(() => sandbox.readText(workspace.id, 'notes.txt'), 'revoked workspace'), 'Revoked workspace authority cannot be reused');

    const webRegistry = createDefaultCapabilityRegistry();
    const webDecision = webRegistry.authorize('service.desktop.workspace.read-text', {
      taskId: 'desktop_web_denied', projectId: 'project_test', mode: 'FILES', requestedBy: 'AGENT', resourceId: 'ws_test', path: 'notes.txt',
    });
    check(!webDecision.allowed && webDecision.reason?.includes('unavailable') === true, 'Desktop workspace services remain unavailable in the default web capability registry');

    const desktopRegistry = createDesktopCapabilityRegistry();
    const desktopDecision = desktopRegistry.authorize('service.desktop.workspace.read-text', {
      taskId: 'desktop_allowed', projectId: 'project_test', mode: 'FILES', requestedBy: 'AGENT', resourceId: 'ws_test', path: 'notes.txt',
    });
    check(desktopDecision.allowed, 'Desktop capability registry enables only the narrow workspace service descriptors');
    check(desktopRegistry.get('service.filesystem')?.availability === 'UNAVAILABLE' && desktopRegistry.get('service.os')?.availability === 'UNAVAILABLE', 'Generic filesystem and OS authority remain unavailable in desktop mode');

    const bridge: DesktopWorkspaceBridge = {
      authorizeWorkspace: async () => ({ success: true, workspace: { id: 'ws_test', name: 'Test Workspace' } }),
      revokeWorkspace: async () => ({ success: true }),
      readWorkspaceText: async (request) => request.workspaceId === 'ws_test' && request.relativePath === 'notes.txt'
        ? { success: true, data: 'bridge text', bytes: 11 }
        : { success: false, error: 'Unexpected read scope' },
      listWorkspace: async () => ({ success: true, entries: [{ name: 'notes.txt', type: 'FILE' }] }),
    };
    const gateway = createDesktopWorkspaceGateway(bridge);
    const readResult = await gateway.execute<{ text: string; bytes: number }>(
      'service.desktop.workspace.read-text',
      { workspaceId: 'ws_test', relativePath: 'notes.txt' },
      { taskId: `desktop_gateway_${Date.now()}`, projectId: 'project_test', mode: 'FILES', requestedBy: 'AGENT', resourceId: 'ws_test', path: 'notes.txt' },
    );
    check(readResult.success && readResult.data?.text === 'bridge text', 'Desktop read executes through capability, resource, permission, sandbox, scope-binding, and output validation gates');

    const mismatchResult = await gateway.execute(
      'service.desktop.workspace.read-text',
      { workspaceId: 'ws_test', relativePath: 'notes.txt' },
      { taskId: `desktop_scope_mismatch_${Date.now()}`, projectId: 'project_test', mode: 'FILES', requestedBy: 'AGENT', resourceId: 'ws_test', path: 'different.txt' },
    );
    check(!mismatchResult.success && mismatchResult.error?.includes('does not match approved capability scope') === true, 'Service input cannot differ from the resource/path scope presented to the permission gate');
  } finally {
    await fs.promises.rm(base, { recursive: true, force: true });
  }

  return { passed, total };
}
