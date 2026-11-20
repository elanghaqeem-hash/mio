import type {ModelProvider,ModelRequest,ModelResponse} from '../../types/models';
import { MioCognitiveOrchestrator, type LocalModelProfile } from './MioCognitiveOrchestrator';
export class MioNativeRouterProvider implements ModelProvider {
 readonly id='ollama' as const;
 readonly displayName='MIO Native Local Router';
 readonly requiresNetwork=false;
 readonly requiresProxy=false;
 constructor(private readonly profiles:readonly LocalModelProfile[],private readonly transport:typeof fetch=fetch){}
 async generate(request:ModelRequest,signal?:AbortSignal):Promise<ModelResponse>{
  if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
  if(request.applicationContext||request.memoryContext)throw Error('MIO_NATIVE_CONTEXT_UNSUPPORTED');
  const messages=request.messages.map(m=>({role:m.role,content:m.content}));
  const prompt=messages.filter(m=>m.role==='user').at(-1)?.content;
  if(!prompt)throw Error('MIO_NATIVE_USER_MESSAGE_REQUIRED');
  const core=new MioCognitiveOrchestrator(this.profiles,this.transport);
  const cancel=()=>core.dispose();
  signal?.addEventListener('abort',cancel,{once:true});
  try{
   if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
   const response=await core.generate(prompt,300000,undefined,undefined,messages);
   if(signal?.aborted)throw Error('MIO_NATIVE_CANCELLED');
   return {provider:this.id,model:response.model,text:response.text,generatedAt:Date.now(),source:'LOCAL_ENDPOINT'};
  }finally{signal?.removeEventListener('abort',cancel);core.dispose();}
 }
}
