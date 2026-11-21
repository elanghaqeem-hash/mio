/** Trusted Electron-main, text-only Ollama chat. No tools, filesystem or external providers. */
export interface DesktopLocalChatRequest { messages:Array<{role:'system'|'user'|'assistant';content:string}>; }
export class DesktopLocalChat {
 private stopped=false;
 private active:AbortController|null=null;
 constructor(private readonly transport:typeof fetch=fetch){}
 async generate(value:unknown):Promise<{success:boolean;text?:string;model?:string;error?:string}>{
  if(this.stopped)return {success:false,error:'LOCAL_CHAT_STOPPED'};
  if(this.active)return {success:false,error:'LOCAL_CHAT_BUSY'};
  const v=value as Partial<DesktopLocalChatRequest>|null;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==1||!Array.isArray(v.messages)||v.messages.length<1||v.messages.length>13||
    v.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>32000)||
    v.messages.reduce((n,m)=>n+m.content.length,0)>32000||!v.messages.some(m=>m.role==='user'&&m.content.trim()))
   return {success:false,error:'LOCAL_CHAT_INVALID_REQUEST'};
  const snapshot=v.messages.map(m=>({role:m.role,content:m.content}));
  const controller=new AbortController();this.active=controller;
  const timer=setTimeout(()=>controller.abort(),120000);
  try{
   const tags=await this.transport('http://127.0.0.1:11434/api/tags',{signal:controller.signal,redirect:'error',credentials:'omit'});
   if(!tags.ok)throw Error('LOCAL_CHAT_OLLAMA_UNAVAILABLE');
   const inventory=await tags.json() as {models?:Array<{name?:string}>};
   if(!Array.isArray(inventory.models)||!inventory.models.some(m=>m.name==='qwen2.5:3b'))throw Error('LOCAL_CHAT_MODEL_NOT_INSTALLED');
   const response=await this.transport('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen2.5:3b',stream:false,messages:snapshot,options:{num_predict:1024}}),signal:controller.signal,redirect:'error',credentials:'omit'});
   if(!response.ok)throw Error('LOCAL_CHAT_OLLAMA_HTTP_'+response.status);
   const data=await response.json() as {done?:boolean;model?:string;message?:{content?:string}};
   if(controller.signal.aborted||this.stopped)throw Error('LOCAL_CHAT_STOPPED');
   if(data.done!==true||data.model!=='qwen2.5:3b'||typeof data.message?.content!=='string'||!data.message.content.trim()||data.message.content.length>65536)throw Error('LOCAL_CHAT_RESPONSE_INVALID');
   return {success:true,text:data.message.content.trim(),model:'qwen2.5:3b'};
  }catch(error){return {success:false,error:controller.signal.aborted?'LOCAL_CHAT_CANCELLED_OR_TIMEOUT':error instanceof Error?error.message:'LOCAL_CHAT_UNAVAILABLE'};}
  finally{clearTimeout(timer);if(this.active===controller)this.active=null;}
 }
 stop(){this.stopped=true;this.active?.abort();}
}
