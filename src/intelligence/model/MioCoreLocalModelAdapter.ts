/** Local-only text inference adapter. No tools, external providers or mutation execution. */
import type { ModelMessage } from '../../types/models';
import { MioIntelligenceLifecycle } from '../../core/MioIntelligenceLifecycle';
export class MioCoreLocalModelAdapter {
 private readonly core=new MioIntelligenceLifecycle(1);
 constructor(private readonly model='qwen2.5:3b',private readonly transport:typeof fetch=fetch){
  if(!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/.test(model)){this.core.dispose();throw Error('MIO_LOCAL_MODEL_INVALID');}
 }
 private async invoke<T>(timeoutMs:number,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw Error('MIO_LOCAL_TIMEOUT_INVALID');
  const task=this.core.begin(),controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let rejectAbort:(reason:Error)=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const stop=()=>{controller.abort();rejectAbort(Error('MIO_LOCAL_STOPPED'));};
  task.signal.addEventListener('abort',stop,{once:true});
  timer=setTimeout(()=>{controller.abort();rejectAbort(Error('MIO_LOCAL_TIMEOUT'));},timeoutMs);
  try{
   if(task.signal.aborted)stop();
   const result=await Promise.race([aborted,Promise.resolve().then(()=>{if(controller.signal.aborted)throw Error('MIO_LOCAL_ABORTED');return work(controller.signal);})]);
   if(controller.signal.aborted||!this.core.finish(task.token))throw Error('MIO_LOCAL_RESULT_DENIED');
   return result;
  }finally{
   clearTimeout(timer);task.signal.removeEventListener('abort',stop);this.core.finish(task.token);
  }
 }
 private async request(path:'/api/tags'|'/api/chat',signal:AbortSignal,body?:unknown){
  const response=await this.transport('http://127.0.0.1:11434'+path,{method:body===undefined?'GET':'POST',redirect:'error',credentials:'omit',signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  if(!response.ok)throw Error('MIO_LOCAL_HTTP_'+response.status);
  return response.json();
 }
 readiness(timeoutMs=8000){
  return this.invoke(timeoutMs,async signal=>{
   const p=await this.request('/api/tags',signal);
   return {ready:Array.isArray(p?.models)&&p.models.some((m:unknown)=>!!m&&typeof m==='object'&&(m as {name?:unknown}).name===this.model),model:this.model,localOnly:true as const};
  });
 }
 generate(prompt:string,timeoutMs=120000){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>32000)throw Error('MIO_LOCAL_PROMPT_INVALID');
  return this.generateMessages([{role:'user',content:prompt}],timeoutMs);
 }
 generateMessages(messages:readonly ModelMessage[],timeoutMs=120000){
  if(!Array.isArray(messages)||messages.length<1||messages.length>128||messages.some((m:ModelMessage)=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')||messages.reduce((n:number,m:ModelMessage)=>n+m.content.length,0)>32000||!messages.some((m:ModelMessage)=>m.role==='user'&&m.content.trim()))throw Error('MIO_LOCAL_MESSAGES_INVALID');
  const snapshot=messages.map((m:ModelMessage)=>({role:m.role,content:m.content}));
  return this.invoke(timeoutMs,async signal=>{
   const p=await this.request('/api/chat',signal,{model:this.model,stream:false,messages:snapshot,options:{num_predict:1024}});
   if(p?.done!==true||p.model!==this.model||typeof p.message?.content!=='string'||!p.message.content.trim()||p.message.content.length>65536)throw Error('MIO_LOCAL_RESPONSE_INVALID');
   return {text:p.message.content.trim(),model:this.model,provider:'ollama' as const,localOnly:true as const,mutationPermitted:false as const};
  });
 }
 dispose(){this.core.dispose();}
}
