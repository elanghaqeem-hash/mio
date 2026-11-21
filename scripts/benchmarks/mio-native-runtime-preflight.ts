/** Windows/local read-only readiness check. No inference or API key. */
import { checkNativeRuntimePreflight } from '../../electron/ipc/nativeRuntimePreflight';
async function main(){
 const result=await checkNativeRuntimePreflight();
 console.log(JSON.stringify({stage:'M-2.02e',...result},null,2));
 if(!result.ready)process.exitCode=2;
}
main().catch(error=>{console.error('MIO_PREFLIGHT_FAILED:',error instanceof Error?error.message:'UNKNOWN');process.exitCode=1;});
