import { validateCreative3DRelationshipGraph,verifiedCreative3DRelationships } from '../file-intelligence/Creative3DRelationships';
interface SuiteResult{passed:number;total:number}
export async function runCreative3DRelationshipTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`Creative3DRelationships test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const g=validateCreative3DRelationshipGraph({sourceAssetId:'model-1',relationships:[{kind:'TEXTURE',target:'textures/base.png',verified:true,evidence:'STRUCTURE_REFERENCE'},{kind:'EXTERNAL_ASSET',target:'reference.bin',verified:false,evidence:'IMPORTED_REFERENCE'}],analyzerVersion:'mio-creative-3d-relationships-v1'});
 check(verifiedCreative3DRelationships(g).length===1,'Only verified relationships are selected');
 let unsafe=false;try{validateCreative3DRelationshipGraph({...g,relationships:[{kind:'TEXTURE',target:'../secret.png',verified:true,evidence:'STRUCTURE_REFERENCE'}]});}catch{unsafe=true;}check(unsafe,'Traversal-like relationship target is rejected');
 let promoted=false;try{validateCreative3DRelationshipGraph({...g,relationships:[{kind:'EXTERNAL_ASSET',target:'asset.bin',verified:true,evidence:'IMPORTED_REFERENCE'}]});}catch{promoted=true;}check(promoted,'Imported relationship cannot be silently promoted to verified');
 let duplicate=false;try{validateCreative3DRelationshipGraph({...g,relationships:[g.relationships[0],g.relationships[0]]});}catch{duplicate=true;}check(duplicate,'Duplicate relationships are rejected');
 return {passed,total};
}
