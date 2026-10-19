import * as fs from 'node:fs';
import * as path from 'node:path';
const assert = (condition: unknown, label: string): void => { if (!condition) throw new Error(label); };

export async function runTrustedCubeElectronIpcTests(): Promise<{ passed: number; total: number }> {
  const main = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  const channels = fs.readFileSync(path.resolve('electron/ipc/channels.ts'), 'utf8');
  const preload = fs.readFileSync(path.resolve('electron/preload.ts'), 'utf8');
  const handler = fs.readFileSync(path.resolve('electron/ipc/handlers.ts'), 'utf8');
  const tests: Array<[string, () => void]> = [
    ['cube IPC uses secure main-frame guard and typed preload', () => {
      assert(main.includes('secureHandle(IPC_CHANNELS.DESKTOP_CREATE_TRUSTED_CUBE,'), 'missing trusted main IPC');
      assert(channels.includes('DESKTOP_CREATE_TRUSTED_CUBE'), 'missing channel');
      assert(preload.includes('createTrustedCube: (request) => ipcRenderer.invoke(IPC_CHANNELS.DESKTOP_CREATE_TRUSTED_CUBE, request)'), 'missing typed preload');
    }],
    ['cube capability allows one fixed template and workspace-scoped request', () => {
      const area = handler.slice(handler.indexOf('const validCubeRequest ='), handler.indexOf('const cubeApproval ='));
      assert(area.includes("value.mode === '3D'") && area.includes("value.templateId === 'primitive_cube_v1'"), 'unrestricted template');
      assert(area.includes('validateWorkspaceId(value.projectId)'), 'workspace id unchecked');
      const invocation = handler.slice(handler.indexOf('const invokeTrustedCube ='), handler.indexOf('return {\n    handleCreateTrustedCube:'));
      assert(invocation.includes('isAuthorizedWorkspace(request.projectId)'), 'workspace authority not verified');
      assert(invocation.includes('cubeApprovalPending = true'), 'racing approvals not prevented');
    }],
    ['human confirmation is in Electron main and rechecks STOP after dialog', () => {
      const block = handler.slice(handler.indexOf('const cubeApproval ='), handler.indexOf('const invokeTrustedCube ='));
      assert(block.includes('dialog.showMessageBox(mainWindow') && block.includes('cancelId: 0'), 'confirmation absent or unsafe default');
      assert(block.includes("choice.response === 1 && !desktopMutationStopped && isAuthorizedWorkspace(command.projectId)"), 'approval TOCTOU');
    }],
    ['STOP, window shutdown and workspace revocation respect active creative work', () => {
      assert(handler.includes('stopCreative();') && handler.includes('creativeRuntime?.activeCount()'), 'creative STOP/drain missing');
      assert(handler.includes('workspaceMutationLease.hasActive() || creativeBusy()'), 'window close ignores creative operation');
      assert(handler.includes('workspaceMutationLease.isActive(workspaceId) || creativeBusy()'), 'workspace revocation ignores creative operation');
      assert(main.includes("app.on('before-quit', event =>") && main.includes("event.preventDefault()"), 'quit bypasses drain');
    }],
    ['no arbitrary executor callback is received through IPC', () => {
      const block = handler.slice(handler.indexOf('const invokeTrustedCube ='), handler.indexOf('return {\n    handleCreateTrustedCube:'));
      assert(block.includes('new TrustedCubeSceneAdapter(root, cubeApproval)'), 'untrusted adapter entry');
      assert(block.includes('createTrustedNodeCreativeExecutor(root,'), 'durable node runtime bypass');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
