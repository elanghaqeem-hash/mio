import assert from 'node:assert/strict';
import { assessNativeHardware, MIN_LOCAL_FREE_BYTES, MIN_LOCAL_TOTAL_BYTES } from '../../electron/ipc/nativeHardwareAdmission';
import { NativeDesktopChatService } from '../../electron/ipc/nativeLocalChat';
const miB=1024*1024;
const messages=[{role:'user' as const,content:'Hello'}];
const healthy=()=>({totalMemoryBytes:8*1024*miB,freeMemoryBytes:4*1024*miB,logicalCpuCount:4});
const ready=()=>Response.json({models:[{name:'qwen2.5:3b'}]});
const answer=()=>Response.json({done:true,model:'qwen2.5:3b',message:{content:'MIO ready'}});
async function main(){
 assert.equal(MIN_LOCAL_TOTAL_BYTES,2*1024*miB);
 assert.equal(MIN_LOCAL_FREE_BYTES,768*miB);
 assert.equal(assessNativeHardware(healthy()).allowed,true);
 assert.equal(assessNativeHardware({totalMemoryBytes:MIN_LOCAL_TOTAL_BYTES,freeMemoryBytes:MIN_LOCAL_FREE_BYTES,logicalCpuCount:1}).allowed,true);
 assert.equal(assessNativeHardware({totalMemoryBytes:MIN_LOCAL_TOTAL_BYTES-1,freeMemoryBytes:MIN_LOCAL_FREE_BYTES,logicalCpuCount:4}).reason,'MIO_HARDWARE_TOTAL_MEMORY_LOW');
 assert.equal(assessNativeHardware({totalMemoryBytes:8*1024*miB,freeMemoryBytes:MIN_LOCAL_FREE_BYTES-1,logicalCpuCount:4}).reason,'MIO_HARDWARE_FREE_MEMORY_LOW');
 for(const bad of [null,{}, {totalMemoryBytes:-1,freeMemoryBytes:0,logicalCpuCount:4},{totalMemoryBytes:100,freeMemoryBytes:200,logicalCpuCount:4},{totalMemoryBytes:100,freeMemoryBytes:50,logicalCpuCount:0},{totalMemoryBytes:Infinity,freeMemoryBytes:0,logicalCpuCount:4}]){
  assert.equal(assessNativeHardware(bad).reason,'MIO_HARDWARE_UNKNOWN');
 }
 let calls=0;
 const transport:typeof fetch=async(url)=>{calls++;return String(url).endsWith('/api/tags')?ready():answer();};
 const low=new NativeDesktopChatService(transport,200,()=>({totalMemoryBytes:8*1024*miB,freeMemoryBytes:256*miB,logicalCpuCount:4}));
 assert.equal((await low.chat({messages})).error,'MIO_HARDWARE_FREE_MEMORY_LOW');
 assert.equal(low.inspect().accepted,0);assert.equal(low.inspect().active,0);assert.equal(calls,0);
 const unknown=new NativeDesktopChatService(transport,200,()=>{throw Error('Hardware probe unavailable');});
 assert.equal((await unknown.chat({messages})).error,'MIO_HARDWARE_UNKNOWN');
 assert.equal(calls,0);
 let freeBytes=256*miB;
 const dynamic=new NativeDesktopChatService(transport,200,()=>({...healthy(),freeMemoryBytes:freeBytes}));
 assert.equal((await dynamic.chat({messages})).success,false);
 freeBytes=4*1024*miB;
 assert.equal((await dynamic.chat({messages})).text,'MIO ready');
 freeBytes=256*miB;
 assert.equal((await dynamic.chat({messages})).error,'MIO_HARDWARE_FREE_MEMORY_LOW');
 assert.equal(dynamic.inspect().accepted,1,'denied admission not recorded as inference');
 assert.equal(calls,3,'only approved request may access local Ollama');
 dynamic.stop();
 assert.equal((await dynamic.chat({messages})).error,'MIO_DESKTOP_NATIVE_STOPPED');
 assert.equal(dynamic.inspect().stoppedLatch,true);
 assert.ok(!JSON.stringify(dynamic.inspect()).includes('Hello'));
 console.log(JSON.stringify({stage:'M-2.02e',hardwareAdmission:'pass',mockTransport:true,actualGpuFit:'NOT_TESTED',liveOllama:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
