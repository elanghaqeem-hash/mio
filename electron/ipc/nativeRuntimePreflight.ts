/** M-2.02e: explicit, read-only local runtime preflight. No inference or remote fallback. */
import { MioNativeModelInventory } from '../../src/intelligence/model/MioNativeModelInventory';
import { assessNativeHardware, readNativeHardwareSnapshot, type LocalHardwareSnapshot } from './nativeHardwareAdmission';
export type NativePreflightStatus='READY'|'LOW_MEMORY'|'HARDWARE_UNKNOWN'|'OLLAMA_UNREACHABLE'|'MODEL_MISSING';
export interface NativePreflightResult {
 status:NativePreflightStatus;
 ready:boolean;
 hardwareReason:string;
 totalMemoryMiB:number|null;
 freeMemoryMiB:number|null;
 logicalCpuCount:number|null;
 installedTargetModel:boolean;
 endpoint:'LOCAL_LOOPBACK_ONLY';
 inferenceExecuted:false;
}
export async function checkNativeRuntimePreflight(
 transport:typeof fetch=fetch,
 readHardware:()=>LocalHardwareSnapshot=readNativeHardwareSnapshot,
 timeoutMs=8000
):Promise<NativePreflightResult>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('MIO_PREFLIGHT_TIMEOUT_INVALID');
 let hardware:ReturnType<typeof assessNativeHardware>;
 try{hardware=assessNativeHardware(readHardware());}
 catch{hardware=assessNativeHardware(null);}
 const base={
  hardwareReason:hardware.reason,totalMemoryMiB:hardware.totalMemoryMiB,
  freeMemoryMiB:hardware.freeMemoryMiB,logicalCpuCount:hardware.logicalCpuCount,
  installedTargetModel:false,endpoint:'LOCAL_LOOPBACK_ONLY' as const,inferenceExecuted:false as const,
 };
 if(!hardware.allowed){
  return {...base,status:hardware.reason==='MIO_HARDWARE_UNKNOWN'?'HARDWARE_UNKNOWN' as const:'LOW_MEMORY' as const,ready:false};
 }
 const inventory=new MioNativeModelInventory(transport);
 try{
  const models=await inventory.discover(timeoutMs);
  const installedTargetModel=models.some(m=>m.name==='qwen2.5:3b');
  return {...base,installedTargetModel,status:installedTargetModel?'READY' as const:'MODEL_MISSING' as const,ready:installedTargetModel};
 }catch{
  return {...base,status:'OLLAMA_UNREACHABLE' as const,ready:false};
 }finally{inventory.dispose();}
}
