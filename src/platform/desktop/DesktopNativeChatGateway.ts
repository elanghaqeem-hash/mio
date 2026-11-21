import type { ModelMessage, ModelResponse } from '../../types/models';
export interface DesktopNativeChatBridge {
 nativeLocalChat(request:{messages:ModelMessage[]}):Promise<{success:boolean;text?:string;model?:string;source?:'LOCAL_ENDPOINT';error?:string}>;
}
export function getDesktopNativeChatBridge():DesktopNativeChatBridge|undefined {
 if(typeof window==='undefined')return undefined;
 const bridge=window.mioDesktop;
 return typeof bridge?.nativeLocalChat==='function'?bridge:undefined;
}
export async function generateDesktopNativeChat(messages:readonly ModelMessage[],bridge:DesktopNativeChatBridge):Promise<ModelResponse>{
 if(!Array.isArray(messages)||messages.length<1||messages.length>12||messages.at(-1)?.role!=='user'||
  messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')||
  messages.reduce((n,m)=>n+m.content.length,0)>32000)throw Error('MIO_DESKTOP_NATIVE_REQUEST_INVALID');
 const result=await bridge.nativeLocalChat({messages:messages.map(m=>({role:m.role,content:m.content}))});
 if(!result.success)throw Error(result.error??'MIO_DESKTOP_NATIVE_UNAVAILABLE');
 if(result.source!=='LOCAL_ENDPOINT'||typeof result.model!=='string'||!result.model||
  typeof result.text!=='string'||!result.text.trim()||result.text.length>65536)throw Error('MIO_DESKTOP_NATIVE_RESPONSE_INVALID');
 return {provider:'ollama',model:result.model,text:result.text,generatedAt:Date.now(),source:'LOCAL_ENDPOINT'};
}
