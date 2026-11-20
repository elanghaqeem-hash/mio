/** File size is an inventory bound, not a measured RAM/VRAM requirement. */
import type { LocalInventoryItem } from './MioNativeModelInventory';
import type { CognitiveWorkload, LocalModelProfile } from './MioCognitiveOrchestrator';
export interface ModelAllocationBudget {maxModelFileBytes:number;}
export function allocateLocalModels(inventory:readonly LocalInventoryItem[],profiles:readonly LocalModelProfile[],workload:CognitiveWorkload,budget:ModelAllocationBudget):LocalModelProfile[]{
 if(!Number.isSafeInteger(budget.maxModelFileBytes)||budget.maxModelFileBytes<1)throw Error('MIO_ALLOCATION_BUDGET_INVALID');
 const eligible=new Set(inventory.filter(m=>typeof m.sizeBytes==='number'&&Number.isSafeInteger(m.sizeBytes)&&m.sizeBytes>0&&m.sizeBytes<=budget.maxModelFileBytes).map(m=>m.name));
 return profiles.filter(p=>eligible.has(p.model)&&p.workloads.includes(workload)).map(p=>({model:p.model,workloads:[...p.workloads]}));
}
