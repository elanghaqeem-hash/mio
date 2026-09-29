import { deflateRawSync } from 'zlib';
import { readBoundedZipEntries } from '../../electron/ipc/boundedZipReader';

interface SuiteResult { passed: number; total: number; }
const le16 = (n:number)=>[n&255,(n>>>8)&255], le32=(n:number)=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
function zipLocal(name:string, data:Uint8Array, deflate=false):Uint8Array {
  const nameBytes=new TextEncoder().encode(name), body=deflate?new Uint8Array(deflateRawSync(data)):data;
  return new Uint8Array([0x50,0x4b,0x03,0x04,20,0,0,0,...le16(deflate?8:0),0,0,0,0,0,0,0,0,...le32(body.length),...le32(data.length),...le16(nameBytes.length),0,0,...nameBytes,...body]);
}
export async function runBoundedZipReaderTests(): Promise<SuiteResult> {
  let passed=0,total=0; const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`BoundedZipReader test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
  const xml=new TextEncoder().encode('<w:t>Hello</w:t>');
  const stored=readBoundedZipEntries(zipLocal('word/document.xml',xml),new Set(['word/document.xml']));
  check(stored.length===1 && new TextDecoder().decode(stored[0].bytes).includes('Hello'),'Stored OOXML entry is read');
  const compressed=readBoundedZipEntries(zipLocal('ppt/slides/slide1.xml',xml,true),new Set(['ppt/slides/slide1.xml']));
  check(compressed.length===1 && compressed[0].bytes.length===xml.length,'Deflated OOXML entry is bounded and decompressed');
  check(readBoundedZipEntries(zipLocal('word/media/a.png',new Uint8Array([1,2])),new Set(['word/document.xml'])).length===0,'Unrequested archive payload is not returned');
  let traversal=false; try{readBoundedZipEntries(zipLocal('../evil.xml',xml),new Set(['../evil.xml']));}catch{traversal=true;} check(traversal,'ZIP path traversal is rejected');
  return {passed,total};
}
