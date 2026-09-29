import { validateCreative3DPreview } from '../file-intelligence/Creative3DPreview';
import { bridgeCreative3DPreviewToImage } from '../file-intelligence/Creative3DVisualBridge';
interface SuiteResult{passed:number;total:number}
export async function runCreative3DPreviewTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`Creative3DPreview test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const p=validateCreative3DPreview({width:1024,height:1024,source:'LOCAL_RENDERER',rendererId:'fixture-renderer',externalProcessing:false,view:'PERSPECTIVE',analyzerVersion:'mio-creative-3d-preview-v1'});
 check(bridgeCreative3DPreviewToImage(p).imageIntelligenceReady,'Validated preview bridges to image intelligence');
 let external=false;try{validateCreative3DPreview({...p,source:'EXTERNAL_RENDERER',externalProcessing:false});}catch{external=true;}check(external,'External renderer cannot masquerade as local');
 let huge=false;try{validateCreative3DPreview({...p,width:10000,height:10000});}catch{huge=true;}check(huge,'Oversized preview is rejected');
 return {passed,total};
}
