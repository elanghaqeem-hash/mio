import assert from 'node:assert/strict';
import { NativeDesktopChatService, validateNativeDesktopChatRequest } from '../../electron/ipc/nativeLocalChat';
import { generateDesktopNativeChat } from '../../src/platform/desktop/DesktopNativeChatGateway';
import { emergencyStop } from '../../src/core/EmergencyStop';
import type { ModelMessage } from '../../src/types/models';
const messages:ModelMessage[]=[{role:'system',content:'Be concise'},{role:'user',content:'Halo Mio'}];
async function main(){
 emergencyStop.reset();
 assert.equal(validateNativeDesktopChatRequest({messages}),true);
 for(const request of [null,{}, {messages:[]},{messages:[{role:'assistant',content:'bad'}]}, {messages:[{role:'user',content:'x'.repeat(32001)}]}, {messages,endpoint:'https://example.com'}, {messages:[{role:'user',content:'Halo',tool:'execute'}]}])assert.equal(validateNativeDesktopChatRequest(request),false);
 const calls:string[]=[];
 const service=new NativeDesktopChatService(async(url,init)=>{
  calls.push(String(url));
  assert.ok(String(url).startsWith('http://127.0.0.1:11434/'));
  assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');
  if(String(url).endsWith('/api/tags'))return Response.json({models:[{name:'qwen2.5:3b'}]});
  assert.deepEqual(JSON.parse(String(init?.body)).messages,messages);
  return Response.json({done:true,model:'qwen2.5:3b',message:{content:'MIO lokal siap'}});
 });
 const response=await generateDesktopNativeChat(messages,{nativeLocalChat:r=>service.chat(r)});
 assert.equal(response.text,'MIO lokal siap');assert.equal(response.source,'LOCAL_ENDPOINT');
 assert.equal(calls.filter(x=>x.endsWith('/api/chat')).length,1);
 assert.equal((await service.chat({messages:[]})).error,'MIO_DESKTOP_NATIVE_REQUEST_INVALID');
 service.stop();assert.equal((await service.chat({messages})).error,'MIO_DESKTOP_NATIVE_STOPPED');
 const pending=new NativeDesktopChatService(async()=>new Promise<Response>(()=>{}));
 const started=pending.chat({messages});
 assert.equal((await pending.chat({messages})).error,'MIO_DESKTOP_NATIVE_BUSY');
 pending.stop();const stopped=await started;assert.equal(stopped.success,false);
 assert.equal(stopped.error,'MIO_DESKTOP_NATIVE_ABORTED');
 assert.equal((await pending.chat({messages})).error,'MIO_DESKTOP_NATIVE_STOPPED');
 const offline=new NativeDesktopChatService(async()=>{throw Error('ECONNREFUSED');});
 const unavailable=await offline.chat({messages});assert.equal(unavailable.success,false);assert.equal(unavailable.error,'ECONNREFUSED');
 await assert.rejects(generateDesktopNativeChat(messages,{nativeLocalChat:async()=>({success:true,text:'wrong',model:'x',source:undefined})}),/RESPONSE_INVALID/);
 console.log(JSON.stringify({stage:'M-2.02a',desktopNativeChat:'pass',mockTransport:true,liveOllama:false}));
 emergencyStop.reset();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
