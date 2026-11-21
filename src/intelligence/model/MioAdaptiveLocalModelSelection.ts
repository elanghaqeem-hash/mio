/** M-2.02f — deterministic selection using explicitly calibrated RAM headroom.
 * Model file bytes are NOT memory requirements. Nothing is learned or estimated here.
 */
import type { CognitiveWorkload } from './MioCognitiveOrchestrator';
import type { LocalInventoryItem } from './MioNativeModelInventory';
export interface CalibratedLocalModel {
 model:string;
 workloads:readonly CognitiveWorkload[];
 requiredFreeMemoryBytes:number;
 calibration:'USER_VERIFIED';
}
export interface AdaptiveSelectionInput {
 inventory:readonly LocalInventoryItem[];
 profiles:readonly CalibratedLocalModel[];
 workload:CognitiveWorkload;
 freeMemoryBytes:number;
 reserveMemoryBytes:number;
}
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/;
const KINDS=['CHAT','ANALYSIS','CODE','CREATIVE'] as const;
export function selectCalibratedLocalModels(input:AdaptiveSelectionInput):CalibratedLocalModel[]{
 if(!input||!Array.isArray(input.inventory)||!Array.isArray(input.profiles)||
 input.profiles.length>8||!KINDS.includes(input.workload)||
 !Number.isSafeInteger(input.freeMemoryBytes)||input.freeMemoryBytes<0||
 !Number.isSafeInteger(input.reserveMemoryBytes)||input.reserveMemoryBytes<0)throw Error('MIO_ADAPTIVE_INPUT_INVALID');
 const names=new Set<string>();
 for(const p of input.profiles){
  if(!p||typeof p.model!=='string'||!NAME.test(p.model)||names.has(p.model)||
   p.calibration!=='USER_VERIFIED'||!Array.isArray(p.workloads)||!p.workloads.length||
   p.workloads.some((w:CognitiveWorkload)=>!KINDS.includes(w))||
   !Number.isSafeInteger(p.requiredFreeMemoryBytes)||p.requiredFreeMemoryBytes<1)
   throw Error('MIO_ADAPTIVE_PROFILE_INVALID');
  names.add(p.model);
 }
 const installed=new Set(input.inventory.map(x=>x.name));
 const available=input.freeMemoryBytes-input.reserveMemoryBytes;
 return input.profiles.filter(p=>installed.has(p.model)&&p.workloads.includes(input.workload)&&p.requiredFreeMemoryBytes<=available)
 .map(p=>({...p,workloads:[...p.workloads]}));
}
