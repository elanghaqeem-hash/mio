import { validateLayeredGraphicMetadata } from '../file-intelligence/LayeredGraphicMetadata';
import { validateModel3DMetadata } from '../file-intelligence/Model3DMetadata';
interface SuiteResult{passed:number;total:number}
export async function runCreative3DMetadataTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`Creative3DMetadata test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const layered=validateLayeredGraphicMetadata({width:1920,height:1080,layerCount:1,layers:[{index:0,name:'Hero',visible:true,opacity:1}],source:'IMPORTED_METADATA',parserId:'fixture',analyzerVersion:'mio-layered-graphic-v1'});
 check(layered.layers.length===1,'Layered metadata validates');
 let count=false;try{validateLayeredGraphicMetadata({...layered,layerCount:2});}catch{count=true;}check(count,'Conflicting layer count is rejected');
 const model=validateModel3DMetadata({geometry:{meshCount:2,vertexCount:100,triangleCount:50},materials:{count:1,names:['mat']},textures:{count:1,uris:['tex.png']},animations:{count:1,names:['idle'],durationSeconds:2},source:'IMPORTED_METADATA',parserId:'fixture',analyzerVersion:'mio-model-3d-metadata-v1'});
 check(model.geometry.meshCount===2,'3D metadata validates');
 let names=false;try{validateModel3DMetadata({...model,materials:{count:0,names:['mat']}});}catch{names=true;}check(names,'Material names cannot exceed declared count');
 return {passed,total};
}
