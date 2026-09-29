import { validateDocumentRelationships,validateEmbeddedAssetReferences } from '../file-intelligence/DocumentRelationships';
interface SuiteResult{passed:number;total:number}
export async function runDocumentRelationshipTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`DocumentRelationships test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const rel=validateDocumentRelationships([{id:'r1',fromAssetId:'doc1',toAssetId:'img1',kind:'EMBEDS',evidenceRefs:['package:word/media/image1.png'],confidence:1,source:'PACKAGE',externalTarget:false}]);
 check(rel[0].kind==='EMBEDS','Package relationship validates with evidence');
 const refs=validateEmbeddedAssetReferences([{id:'a1',documentAssetId:'doc1',packagePath:'word/media/image1.png',mediaKind:'IMAGE'}]);
 check(refs[0].packagePath==='word/media/image1.png','Safe embedded package path validates');
 let traversal=false;try{validateEmbeddedAssetReferences([{id:'a2',documentAssetId:'doc1',packagePath:'../evil.bin',mediaKind:'OTHER'}]);}catch{traversal=true;}check(traversal,'Embedded asset traversal path is rejected');
 let evidence=false;try{validateDocumentRelationships([{id:'r2',fromAssetId:'a',toAssetId:'b',kind:'RELATED',evidenceRefs:[],confidence:.5,source:'HEURISTIC',externalTarget:false}]);}catch{evidence=true;}check(evidence,'Ungrounded relationship is rejected');
 return {passed,total};
}
