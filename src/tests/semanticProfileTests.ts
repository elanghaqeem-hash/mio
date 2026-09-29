import { validateSemanticAssetProfile } from '../file-intelligence/SemanticProfile';
interface SuiteResult{passed:number;total:number}
export async function runSemanticProfileTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`SemanticProfile test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const p=validateSemanticAssetProfile({assetId:'asset-1',claims:[{id:'c1',kind:'TOPIC',value:'cybersecurity',confidence:.8,source:'LOCAL_HEURISTIC',externalProcessing:false,evidence:[{modality:'DOCUMENT',assetId:'asset-1',locator:'page:1'}]}],analyzerVersion:'mio-semantic-profile-v1'});
 check(p.claims.length===1,'Grounded semantic claim validates');
 let empty=false;try{validateSemanticAssetProfile({...p,claims:[{...p.claims[0],evidence:[]}]});}catch{empty=true;}check(empty,'Ungrounded semantic claim is rejected');
 let model=false;try{validateSemanticAssetProfile({...p,claims:[{...p.claims[0],source:'LOCAL_MODEL'}]});}catch{model=true;}check(model,'Model-derived claim requires model identity');
 let external=false;try{validateSemanticAssetProfile({...p,claims:[{...p.claims[0],source:'EXTERNAL_MODEL',modelId:'semantic-x',externalProcessing:false}]});}catch{external=true;}check(external,'External semantic model cannot masquerade as local');
 return {passed,total};
}
