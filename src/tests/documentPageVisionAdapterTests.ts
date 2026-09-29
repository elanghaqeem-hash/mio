import { prepareDocumentVisionInput } from '../file-intelligence/DocumentPageVisionAdapter';
interface SuiteResult {passed:number;total:number}
export async function runDocumentPageVisionAdapterTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`DocumentPageVisionAdapter test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const gray=prepareDocumentVisionInput({pageIndex:0,width:2,height:1,pixelFormat:'GRAYSCALE8',pixels:new Uint8Array([10,200]),source:'PDF_RENDERER',rendererId:'local-test',externalProcessing:false});
 check(gray.grayscale[0]===10&&gray.grayscale[1]===200,'Grayscale page passes through deterministically');
 const rgb=prepareDocumentVisionInput({pageIndex:1,width:1,height:1,pixelFormat:'RGB8',pixels:new Uint8Array([255,255,255]),source:'PDF_RENDERER',rendererId:'local-test',externalProcessing:false});
 check(rgb.grayscale[0]===255,'RGB page converts to bounded grayscale input');
 check(rgb.rendererId==='local-test'&&!rgb.externalProcessing,'Renderer provenance remains explicit');
 let mismatch=false;try{prepareDocumentVisionInput({pageIndex:0,width:2,height:2,pixelFormat:'RGBA8',pixels:new Uint8Array(3),source:'IMAGE_DOCUMENT',rendererId:'x',externalProcessing:false});}catch{mismatch=true;}check(mismatch,'Malformed pixel buffers are rejected');
 let budget=false;try{prepareDocumentVisionInput({pageIndex:0,width:4097,height:1024,pixelFormat:'GRAYSCALE8',pixels:new Uint8Array(0),source:'PDF_RENDERER',rendererId:'x',externalProcessing:false});}catch{budget=true;}check(budget,'Pages above 4MP analysis budget are rejected');
 return {passed,total};
}
