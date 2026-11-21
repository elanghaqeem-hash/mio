/** Real Electron BrowserWindow, contextBridge and IPC; mocked Ollama transport. */
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const {NativeDesktopChatService}=require('../../dist-electron/electron/ipc/nativeLocalChat.js');
const {IPC_CHANNELS}=require('../../dist-electron/electron/ipc/channels.js');
let windowRef,service,requests=0,completed=false;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const watchdog=setTimeout(()=>{console.error('MIO_NATIVE_GUI_TIMEOUT');process.exit(1);},45000);
async function main(){
 await app.whenReady();
 service=new NativeDesktopChatService(async(url,opts)=>{
  assert(String(url).startsWith('http://127.0.0.1:11434/'),'Nonlocal transport');
  assert(opts.redirect==='error'&&opts.credentials==='omit','Unsafe fetch options');
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'qwen2.5:3b'}]});
  const payload=JSON.parse(opts.body);
  assert(payload.messages.length===2&&payload.messages[0].role==='system'&&payload.messages[1].content==='Halo MIO','Message roles lost');
  requests++;
  return Response.json({done:true,model:'qwen2.5:3b',message:{content:'Halo dari MIO lokal'}});
 });
 windowRef=new BrowserWindow({width:700,height:450,show:false,webPreferences:{
  preload:path.resolve('dist-electron/electron/preload.js'),
  contextIsolation:true,nodeIntegration:false,sandbox:false,webSecurity:true
 }});
 ipcMain.handle(IPC_CHANNELS.DESKTOP_NATIVE_LOCAL_CHAT,async(event,request)=>{
  assert(event.sender===windowRef.webContents&&event.senderFrame===windowRef.webContents.mainFrame,'Untrusted IPC sender');
  return service.chat(request);
 });
 await windowRef.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!DOCTYPE html><html><body>Native chat test</body></html>'));
 const result=await windowRef.webContents.executeJavaScript(`(async()=>{
  const messages=[{role:'system',content:'Be concise'},{role:'user',content:'Halo MIO'}];
  const normal=await window.mioDesktop.nativeLocalChat({messages});
  const injected=await window.mioDesktop.nativeLocalChat({messages,endpoint:'https://evil.example'});
  const wrong=await window.mioDesktop.nativeLocalChat({messages:[{role:'user',content:'hi',tool:'execute'}]});
  return {normal,injected,wrong,hasNode:typeof require!=='undefined'};
 })()`);
 assert(result.normal.success&&result.normal.text==='Halo dari MIO lokal'&&result.normal.source==='LOCAL_ENDPOINT','Electron IPC local chat failed');
 assert(result.injected.error==='MIO_DESKTOP_NATIVE_REQUEST_INVALID'&&result.wrong.error==='MIO_DESKTOP_NATIVE_REQUEST_INVALID','Unsafe envelopes accepted');
 assert(!result.hasNode,'Renderer gained Node privileges');
 assert(requests===1,'Unexpected network inference');
 service.stop();
 const denied=await windowRef.webContents.executeJavaScript(`window.mioDesktop.nativeLocalChat({messages:[{role:'user',content:'halo'}]})`);
 assert(!denied.success&&denied.error==='MIO_DESKTOP_NATIVE_STOPPED','STOP not sticky over contextBridge');
 assert(requests===1,'STOP permitted inference');
 console.log(JSON.stringify({stage:'M-2.02b',electronNativeIpc:'pass',contextIsolation:'pass',stop:'pass',mockTransport:true,liveInference:false}));
}
main().then(()=>{completed=true;clearTimeout(watchdog);windowRef?.destroy();app.quit();})
.catch(e=>{console.error('MIO_NATIVE_GUI_FAILED:',e?.stack||String(e));process.exitCode=1;completed=true;clearTimeout(watchdog);windowRef?.destroy();app.quit();});
app.on('window-all-closed',()=>{if(!completed)process.exitCode=1;app.quit();});
