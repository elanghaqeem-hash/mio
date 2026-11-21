/** Bounded Ollama JSON decoding: limits decompressed bytes, including chunked responses. */
export async function readBoundedLocalJson<T=unknown>(response:Response,maxBytes:number):Promise<T>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw Error('MIO_LOCAL_JSON_LIMIT_INVALID');
 const stated=response.headers.get('content-length');
 if(stated!==null){
  if(!/^\d+$/.test(stated)||!Number.isSafeInteger(Number(stated)))throw Error('MIO_LOCAL_JSON_LENGTH_INVALID');
  if(Number(stated)>maxBytes)throw Error('MIO_LOCAL_JSON_TOO_LARGE');
 }
 const stream=response.body;
 if(!stream)throw Error('MIO_LOCAL_JSON_BODY_MISSING');
 const reader=stream.getReader();
 const chunks:Uint8Array[]=[];
 let bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes)throw Error('MIO_LOCAL_JSON_TOO_LARGE');
   chunks.push(value);
  }
  const buffer=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)) as T;}
  catch{throw Error('MIO_LOCAL_JSON_INVALID');}
 }catch(error){
  void reader.cancel().catch(()=>{});
  throw error;
 }finally{reader.releaseLock();}
}
