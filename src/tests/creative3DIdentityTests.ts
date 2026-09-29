import { identifyCreative3DByExtension,validateCreative3DIdentity } from '../file-intelligence/Creative3DIdentity';
import { inspectCreative3DSignature } from '../file-intelligence/Creative3DSignatureInspector';
interface SuiteResult{passed:number;total:number}
export async function runCreative3DIdentityTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`Creative3DIdentity test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 check(identifyCreative3DByExtension('scene.glb').format==='GLB','GLB extension maps to 3D');
 check(inspectCreative3DSignature('unknown.bin',new TextEncoder().encode('8BPSxxxx'))?.format==='PSD','PSD signature overrides unknown extension');
 check(inspectCreative3DSignature('model.glb',new Uint8Array([0x67,0x6c,0x54,0x46]))?.format==='GLB','GLB magic is recognized');
 check(inspectCreative3DSignature('vector.svg',new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))?.format==='SVG','SVG structure is recognized');
 let invalid=false;try{validateCreative3DIdentity({format:'UNKNOWN',kind:'MODEL_3D',extension:'x',source:'EXTENSION',analyzerVersion:'mio-creative-3d-identity-v1'});}catch{invalid=true;}check(invalid,'Unknown format cannot claim known kind');
 return {passed,total};
}
