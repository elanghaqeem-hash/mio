/** Electron main-process native chat: fixed loopback, bounded text-only IPC, no tools or remote fallback. */
import { MioNativeRouterProvider } from '../../src/intelligence/model/MioNativeRouterProvider';
import type { ModelMessage } from '../../src/types/models';

export interface NativeDesktopChatRequest { messages: ModelMessage[]; }
export interface NativeDesktopChatResult { success:boolean; text?:string; model?:string; source?:'LOCAL_ENDPOINT'; error?:string; }
const LIMIT=32000;
export function validateNativeDesktopChatRequest(value:unknown):value is NativeDesktopChatRequest {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('messages' in value))return false;
 const messages=value.messages;
 if(!Array.isArray(messages)||messages.length<1||messages.length>12)return false;
 let chars=0;
 for(const item of messages){
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==2||
     !Object.hasOwn(item,'role')||!Object.hasOwn(item,'content')||
     !['system','user','assistant'].includes(item.role)||typeof item.content!=='string')return false;
  chars+=item.content.length;
  if(chars>LIMIT)return false;
 }
 return messages.at(-1)?.role==='user'&&messages.at(-1)?.content.trim().length>0;
}
export class NativeDesktopChatService {
 private stopped=false;
 private readonly active=new Set<AbortController>();
 constructor(private readonly transport:typeof fetch=fetch){}
 async chat(request:unknown):Promise<NativeDesktopChatResult>{
  if(this.stopped)return {success:false,error:'MIO_DESKTOP_NATIVE_STOPPED'};
  if(!validateNativeDesktopChatRequest(request))return {success:false,error:'MIO_DESKTOP_NATIVE_REQUEST_INVALID'};
  if(this.active.size>0)return {success:false,error:'MIO_DESKTOP_NATIVE_BUSY'};
  const controller=new AbortController();
  this.active.add(controller);
  const timer=setTimeout(()=>controller.abort(),120000);
  try{
   const messages=request.messages.map(m=>({role:m.role,content:m.content}));
   const provider=new MioNativeRouterProvider([{model:'qwen2.5:3b',workloads:['CHAT','ANALYSIS','CODE','CREATIVE']}],this.transport);
   const response=await Promise.race([
    provider.generate({messages},controller.signal),
    new Promise<never>((_,reject)=>{
     if(controller.signal.aborted){reject(Error('MIO_DESKTOP_NATIVE_ABORTED'));return;}
     controller.signal.addEventListener('abort',()=>reject(Error('MIO_DESKTOP_NATIVE_ABORTED')),{once:true});
    }),
   ]);
   if(this.stopped||controller.signal.aborted)return {success:false,error:'MIO_DESKTOP_NATIVE_ABORTED'};
   if(!response.text||response.text.length>65536)return {success:false,error:'MIO_DESKTOP_NATIVE_RESPONSE_INVALID'};
   return {success:true,text:response.text,model:response.model,source:'LOCAL_ENDPOINT'};
  }catch(error){
   return {success:false,error:this.stopped||controller.signal.aborted?'MIO_DESKTOP_NATIVE_ABORTED':error instanceof Error?error.message.slice(0,180):'MIO_DESKTOP_NATIVE_FAILED'};
  }finally{clearTimeout(timer);this.active.delete(controller);}
 }
 stop(){if(this.stopped)return;this.stopped=true;for(const controller of this.active)controller.abort();}
 inspect(){return {stopped:this.stopped,active:this.active.size,localOnly:true as const};}
}
