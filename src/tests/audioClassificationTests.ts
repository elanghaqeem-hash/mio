import { validateAudioClassification } from '../file-intelligence/AudioClassification';
interface SuiteResult{passed:number;total:number}
export async function runAudioClassificationTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`AudioClassification test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const a=validateAudioClassification({class:'SPEECH',evidence:[{startSeconds:0,endSeconds:5,source:'LOCAL_HEURISTIC',confidence:.7,externalProcessing:false}],analyzerVersion:'mio-audio-classification-v1'});
 check(a.class==='SPEECH','Grounded local classification validates');
 let empty=false;try{validateAudioClassification({...a,evidence:[]});}catch{empty=true;}check(empty,'Ungrounded classification is rejected');
 let model=false;try{validateAudioClassification({...a,evidence:[{startSeconds:0,endSeconds:1,source:'LOCAL_MODEL',confidence:.8,externalProcessing:false}]});}catch{model=true;}check(model,'Model classification requires model identity');
 let external=false;try{validateAudioClassification({...a,evidence:[{startSeconds:0,endSeconds:1,source:'EXTERNAL_MODEL',confidence:.8,modelId:'audio-x',externalProcessing:false}]});}catch{external=true;}check(external,'External model cannot masquerade as local');
 return {passed,total};
}
