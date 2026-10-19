/**
 * PRV-11.02 — real Electron BrowserWindow + preload + IPC GUI smoke.
 *
 * Launch ONLY in disposable CI under Xvfb. Native dialog answers are injected
 * by this test harness; real OS dialog/Studio3D rendering are not claimed here.
 * No production code is modified to accept test-only privilege flags.
 */
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setupIpcHandlers } = require('../../dist-electron/electron/ipc/handlers.js');
const { IPC_CHANNELS } = require('../../dist-electron/electron/ipc/channels.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-electron-gui-'));
const workspaceRoot = path.join(root, 'workspace');
fs.mkdirSync(workspaceRoot);
let windowRef;
let handlers;
let dialogChoice = 1;
let nativeApprovalCount = 0;
let nativeWorkspaceCount = 0;
let finished = false;

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const register = (channel, handler) => {
  ipcMain.handle(channel, async (event, ...args) => {
    assert(windowRef && event.sender === windowRef.webContents &&
      event.senderFrame === windowRef.webContents.mainFrame, 'untrusted renderer sender');
    return handler(event, ...args);
  });
};
const fixture = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body><button id="create">Create &amp; Inspect Cube</button><output id="state">idle</output>
<script>
document.getElementById('create').addEventListener('click', async () => {
  const status = document.getElementById('state');
  status.textContent = 'running';
  try {
    if (!window.mioDesktop) throw Error('preload unavailable');
    const workspace = await window.mioDesktop.authorizeWorkspace();
    if (!workspace.success || !workspace.workspace) throw Error('workspace not authorized');
    const nonce = 'gui_' + crypto.randomUUID().replaceAll('-', '');
    const command = { schemaVersion:1, projectId:workspace.workspace.id, taskId:'gui_task_'+nonce,
      requestId:nonce, mode:'3D', templateId:'primitive_cube_v1' };
    const created = await window.mioDesktop.createTrustedCube(command);
    if (!created.success) { status.textContent = 'rejected:'+(created.error || 'approval'); return; }
    const inspected = await window.mioDesktop.inspectTrustedCube(command);
    if (!inspected.success || !inspected.verified || created.assetId !== inspected.assetId ||
       inspected.scene?.objects[0]?.mesh?.faces.length !== 6) {
      status.textContent = 'invalid-scene'; return;
    }
    const element = document.createElement('div');
    element.id = 'verified-object';
    element.dataset.assetId = inspected.assetId;
    element.textContent = 'Trusted Cube';
    document.body.append(element);
    status.textContent = 'imported';
  } catch (error) {
    status.textContent = 'error:'+String(error && error.message || error);
  }
});
</script></body></html>`;

async function triggerClick() {
  const pos = await windowRef.webContents.executeJavaScript(
    '(() => { const r = document.getElementById("create").getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()');
  windowRef.webContents.sendInputEvent({type:'mouseMove',x:pos.x,y:pos.y});
  windowRef.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:pos.x,y:pos.y});
  windowRef.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:pos.x,y:pos.y});
  const result = await windowRef.webContents.executeJavaScript(`new Promise((resolve,reject) => {
    const deadline=Date.now()+15000;
    const poll=() => {const v=document.getElementById('state').textContent;
      if(v !== 'idle' && v !== 'running') resolve({
        status:v, assetId:document.getElementById('verified-object')?.dataset.assetId || null,
        objects:document.querySelectorAll('#verified-object').length,
      });
      else if(Date.now()>deadline)reject(Error('GUI_CLICK_TIMEOUT'));
      else setTimeout(poll,40);};
    poll();
  })`);
  return result;
}
async function resetPage() {
  await windowRef.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(fixture));
  assert(await windowRef.webContents.executeJavaScript('!!window.mioDesktop'), 'typed context bridge absent');
}

async function run() {
  app.setPath('userData', root);
  await app.whenReady();

  // Dialog stubs belong exclusively to the process-isolated smoke harness.
  dialog.showOpenDialog = async () => {
    nativeWorkspaceCount++;
    return { canceled:false, filePaths:[workspaceRoot] };
  };
  dialog.showMessageBox = async (_win, options) => {
    nativeApprovalCount++;
    assert(options.cancelId === 0 && options.defaultId === 0, 'unsafe approval defaults');
    return { response:dialogChoice, checkboxChecked:false };
  };

  windowRef = new BrowserWindow({
    width:900,height:700,show:true,
    webPreferences:{
      preload:path.resolve('dist-electron/electron/preload.js'),
      contextIsolation:true,nodeIntegration:false,sandbox:false,webSecurity:true,
    },
  });
  handlers = setupIpcHandlers(windowRef);
  register(IPC_CHANNELS.FS_AUTHORIZE_WORKSPACE, event => handlers.handleAuthorizeWorkspace(event));
  register(IPC_CHANNELS.DESKTOP_CREATE_TRUSTED_CUBE, (event, request) => handlers.handleCreateTrustedCube(event,request));
  register(IPC_CHANNELS.DESKTOP_INSPECT_TRUSTED_CUBE, (event, request) => handlers.handleInspectTrustedCube(event,request));

  await resetPage();
  dialogChoice = 0;
  const rejected = await triggerClick();
  assert(rejected.status.startsWith('rejected:'), 'declined native consent failed closed');
  assert(rejected.objects === 0, 'scene appended without consent');
  console.log('PASS: Electron BrowserWindow click + denied native consent');

  await resetPage();
  dialogChoice = 1;
  const accepted = await triggerClick();
  assert(accepted.status === 'imported' && accepted.objects === 1 && accepted.assetId?.startsWith('scene_'),
    'approved native GUI click did not create, inspect and append cube');
  assert(nativeApprovalCount === 2 && nativeWorkspaceCount === 2, 'native consent/workspace flow not invoked twice');
  console.log('PASS: Electron BrowserWindow click + native consent + durable artifact + inspection + visible DOM object');
}

const watchdog = setTimeout(() => {
  console.error('MIO ELECTRON GUI SMOKE FAILED: timeout');
  process.exit(1);
}, 60000);
run().then(() => { finished=true; clearTimeout(watchdog); handlers?.revokeAllWorkspaceAuthority(); windowRef?.destroy(); app.quit(); })
.catch(error => {
  console.error('MIO ELECTRON GUI SMOKE FAILED:', error?.stack || String(error));
  process.exitCode=1;
  finished=true;clearTimeout(watchdog);windowRef?.destroy();app.quit();
});
app.on('window-all-closed',()=>{ if(!finished) process.exitCode=1; app.quit(); });
