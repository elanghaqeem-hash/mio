/** Local inventory only; discovered names do not grant execution or prove capabilities. */
import { MioIntelligenceLifecycle } from '../../core/MioIntelligenceLifecycle';
import type { CognitiveWorkload, LocalModelProfile } from './MioCognitiveOrchestrator';
export interface LocalInventoryItem {name:string;sizeBytes:number|null;}
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/;
export function parseLocalInventory(payload:unknown):LocalInventoryItem[]{
 if(!payload||typeof payload!=='object'||!('models' in payload)||!Array.isArray(payload.models)||payload.models.length>512)throw Error('MIO_INVENTORY_INVALID');
 const seen=new Set<string>(),result:LocalInventoryItem[]=[];
 for(const raw of payload.models){
  if(!raw||typeof raw.name!=='string'||!NAME.test(raw.name)||seen.has(raw.name))throw Error('MIO_INVENTORY_INVALID');
  seen.add(raw.name);
  result.push({name:raw.name,sizeBytes:Number.isSafeInteger(raw.size)&&raw.size>=0?raw.size:null});
 }
 return result;
}
export function selectInstalledProfiles(inventory:readonly LocalInventoryItem[],profiles:readonly LocalModelProfile[],workload:CognitiveWorkload):LocalModelProfile[]{
 const installed=new Set(inventory.map(m=>m.name));
 return profiles.filter(p=>installed.has(p.model)&&p.workloads.includes(workload)).map(p=>({model:p.model,workloads:[...p.workloads]}));
}
export class MioNativeModelInventory{
 private readonly core=new MioIntelligenceLifecycle(1);
 constructor(private readonly transport:typeof fetch=fetch){}
 async discover(timeoutMs=8000):Promise<LocalInventoryItem[]>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('MIO_INVENTORY_TIMEOUT_INVALID');
  const task=this.core.begin(),controller=new AbortController();
  let rejectAbort:(e:Error)=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const stop=()=>{controller.abort();rejectAbort(Error('MIO_INVENTORY_STOPPED'));};
  task.signal.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(()=>{controller.abort();rejectAbort(Error('MIO_INVENTORY_TIMEOUT'));},timeoutMs);
  try{
   if(task.signal.aborted)stop();
   const result=await Promise.race([aborted,Promise.resolve().then(async()=>{
    if(controller.signal.aborted)throw Error('MIO_INVENTORY_ABORTED');
    const r=await this.transport('http://127.0.0.1:11434/api/tags',{signal:controller.signal,redirect:'error',credentials:'omit'});
    if(!r.ok)throw Error('MIO_INVENTORY_HTTP');
    return parseLocalInventory(await r.json());
   })]);
   if(controller.signal.aborted||!this.core.finish(task.token))throw Error('MIO_INVENTORY_RESULT_DENIED');
   return result;
  }finally{clearTimeout(timer);task.signal.removeEventListener('abort',stop);this.core.finish(task.token);}
 }
 dispose(){this.core.dispose();}
}
