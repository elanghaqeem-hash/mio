/** M-2.02b: timeout, stale response, STOP and recovery contracts (no real Ollama). */
import assert from 'node:assert/strict';
import { NativeDesktopChatService } from '../../electron/ipc/nativeLocalChat';
const messages=[{role:'user' as const,content:'Halo MIO'}];
const ready=()=>Response.json({models:[{name:'qwen2.5:3b'}]});
const answer=()=>Response.json({done:true,model:'qwen2.5:3b',message:{content:'Siap'}});
async function main(){
 for(const ms of [0,-1,120001,1.5,NaN,Infinity]){
  assert.throws(()=>new NativeDesktopChatService(fetch,ms),/TIMEOUT_INVALID/);
 }
 let pendingResolve:((value:Response)=>void)|undefined;
 const slow=new NativeDesktopChatService(async(url)=>{
  if(String(url).endsWith('/api/tags'))return ready();
  return new Promise<Response>(resolve=>{pendingResolve=resolve;});
 },35);
 const start=performance.now();
 const result=await slow.chat({messages});
 assert.equal(result.success,false);
 assert.equal(result.error,'MIO_DESKTOP_NATIVE_ABORTED');
 assert.ok(performance.now()-start<3000,'timeout must be bounded even if transport ignores abort');
 assert.equal(slow.inspect().active,0,'timed-out work must release slot');
 pendingResolve?.(answer()); // stale completion must never be surfaced to caller
 await new Promise(resolve=>setTimeout(resolve,10));
 const next=await slow.chat({messages});
 assert.equal(next.success,false);
 assert.equal(next.error,'MIO_DESKTOP_NATIVE_ABORTED');
 slow.stop();
 assert.equal((await slow.chat({messages})).error,'MIO_DESKTOP_NATIVE_STOPPED');
 const hangingDiscovery=new NativeDesktopChatService(async()=>new Promise<Response>(()=>{}),30);
 const blocked=await hangingDiscovery.chat({messages});
 assert.equal(blocked.error,'MIO_DESKTOP_NATIVE_ABORTED');
 assert.equal(hangingDiscovery.inspect().active,0);
 hangingDiscovery.stop();
 const healthy=new NativeDesktopChatService(async url=>String(url).endsWith('/api/tags')?ready():answer(),1000);
 assert.equal((await healthy.chat({messages})).text,'Siap');
 healthy.stop();
 console.log(JSON.stringify({stage:'M-2.02b',timeout:'pass',staleResultDenied:true,stopLatch:true,liveOllama:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
