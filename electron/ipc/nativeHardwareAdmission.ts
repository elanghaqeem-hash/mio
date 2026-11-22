/** M-2.02e — conservative OS-memory admission guard for *local* inference.
 * These process/OS statistics are not Ollama RAM, model fit, or VRAM estimates.
 */
import * as os from 'node:os';

export interface LocalHardwareSnapshot { totalMemoryBytes:number; freeMemoryBytes:number; logicalCpuCount:number; }
export interface LocalHardwareDecision {
 allowed:boolean;
 reason:'MIO_HARDWARE_READY'|'MIO_HARDWARE_UNKNOWN'|'MIO_HARDWARE_TOTAL_MEMORY_LOW'|'MIO_HARDWARE_FREE_MEMORY_LOW';
 totalMemoryMiB:number|null;
 freeMemoryMiB:number|null;
 logicalCpuCount:number|null;
}
const MIB=1024*1024;
export const MIN_LOCAL_TOTAL_BYTES=2*1024*MIB;
export const MIN_LOCAL_FREE_BYTES=768*MIB;
export function readNativeHardwareSnapshot():LocalHardwareSnapshot{
 return {totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem(),logicalCpuCount:os.availableParallelism()};
}
export function assessNativeHardware(value:unknown):LocalHardwareDecision{
 const denial=(reason:LocalHardwareDecision['reason']):LocalHardwareDecision=>({
  allowed:false,reason,totalMemoryMiB:null,freeMemoryMiB:null,logicalCpuCount:null
 });
 if(!value||typeof value!=='object'||Array.isArray(value))return denial('MIO_HARDWARE_UNKNOWN');
 const v=value as Partial<LocalHardwareSnapshot>;
 if(!Number.isSafeInteger(v.totalMemoryBytes)||!Number.isSafeInteger(v.freeMemoryBytes)||
    !Number.isSafeInteger(v.logicalCpuCount)||
    (v.totalMemoryBytes??0)<=0||(v.freeMemoryBytes??-1)<0||
    (v.freeMemoryBytes??0)>(v.totalMemoryBytes??0)||(v.logicalCpuCount??0)<1)
   return denial('MIO_HARDWARE_UNKNOWN');
 const totalMemoryMiB=Math.floor(v.totalMemoryBytes!/MIB);
 const freeMemoryMiB=Math.floor(v.freeMemoryBytes!/MIB);
 const logicalCpuCount=v.logicalCpuCount!;
 const reason=v.totalMemoryBytes!<MIN_LOCAL_TOTAL_BYTES?'MIO_HARDWARE_TOTAL_MEMORY_LOW':
              v.freeMemoryBytes!<MIN_LOCAL_FREE_BYTES?'MIO_HARDWARE_FREE_MEMORY_LOW':'MIO_HARDWARE_READY';
 return {allowed:reason==='MIO_HARDWARE_READY',reason,totalMemoryMiB,freeMemoryMiB,logicalCpuCount};
}
