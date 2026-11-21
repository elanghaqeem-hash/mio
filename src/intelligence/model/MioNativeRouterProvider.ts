import type {ModelProvider,ModelRequest,ModelResponse} from '../../types/models';
import { MioCognitiveOrchestrator, classifyCognitiveRequest, type LocalModelProfile } from './MioCognitiveOrchestrator';
import { MioNativeModelInventory } from './MioNativeModelInventory';
import { selectCalibratedLocalModels, type CalibratedLocalModel } from './MioAdaptiveLocalModelSelection';
export interface NativeCalibratedSelection { profiles:readonly CalibratedLocalModel[];freeMemoryBytes:number;reserveMemoryBytes:number; }
export class MioNativeRouterProvider implements ModelProvider {
 readonly id='ollama' as const;
 readonly displayName='MIO Native Local Router';
 readonly requiresNetwork=false;
 readonly requiresProxy=false;
 constructor(private readonly profiles:readonly LocalModelProfile[],private readonly transport:typeof fetch=fetch,private readonly adaptive?:NativeCalibratedSelection){}
 async generate(request:ModelRequest,signal?:AbortSignal):Promise<ModelResponse>{
  if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
  if(request.applicationContext||request.memoryContext)throw Error('MIO_NATIVE_CONTEXT_UNSUPPORTED');
  const messages=request.messages.map(m=>({role:m.role,content:m.content}));
  const prompt=messages.filter(m=>m.role==='user').at(-1)?.content;
  if(!prompt)throw Error('MIO_NATIVE_USER_MESSAGE_REQUIRED');
  let core:MioCognitiveOrchestrator|undefined;
  let inventory:MioNativeModelInventory|undefined;
  const cancel=()=>{inventory?.dispose();core?.dispose();};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
   if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
   let profiles=this.profiles;
   if(this.adaptive){
    inventory=new MioNativeModelInventory(this.transport);
    const installed=await inventory.discover(8000);
    if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
    const chosen=selectCalibratedLocalModels({inventory:installed,profiles:this.adaptive.profiles,
     workload:classifyCognitiveRequest(prompt),freeMemoryBytes:this.adaptive.freeMemoryBytes,
     reserveMemoryBytes:this.adaptive.reserveMemoryBytes});
    if(!chosen.length)throw Error('MIO_NATIVE_NO_CALIBRATED_MODEL');
    profiles=chosen.map(p=>({model:p.model,workloads:p.workloads}));
    inventory.dispose();inventory=undefined;
   }
   core=new MioCognitiveOrchestrator(profiles,this.transport);
   if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
   const response=await core.generate(prompt,300000,undefined,undefined,messages);
   if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
   return {provider:this.id,model:response.model,text:response.text,generatedAt:Date.now(),source:'LOCAL_ENDPOINT'};
  }finally{signal?.removeEventListener('abort',cancel);core.dispose();}
 }
}
