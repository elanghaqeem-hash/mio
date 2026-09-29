import { validateVideoSemantics } from '../file-intelligence/VideoSemantics';
interface SuiteResult{passed:number;total:number}
export async function runVideoSemanticsTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`VideoSemantics test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const local=validateVideoSemantics({signals:[{kind:'SCREEN_RECORDING',label:'screen recording',evidence:{sampleTimestamps:[0,10],source:'FRAME_HEURISTIC',confidence:.7,externalProcessing:false}}],analyzerVersion:'mio-video-semantics-v1'});
 check(local.signals[0].kind==='SCREEN_RECORDING','Grounded frame heuristic validates');
 let ungrounded=false;try{validateVideoSemantics({signals:[{kind:'ACTIVITY',label:'activity',evidence:{sampleTimestamps:[],source:'FRAME_HEURISTIC',confidence:.5,externalProcessing:false}}],analyzerVersion:'mio-video-semantics-v1'});}catch{ungrounded=true;}check(ungrounded,'Ungrounded video semantics are rejected');
 let model=false;try{validateVideoSemantics({signals:[{kind:'SCENE',label:'office',evidence:{sampleTimestamps:[1],source:'LOCAL_MODEL',confidence:.8,externalProcessing:false}}],analyzerVersion:'mio-video-semantics-v1'});}catch{model=true;}check(model,'Model semantics require model identity');
 let external=false;try{validateVideoSemantics({signals:[{kind:'SCENE',label:'office',evidence:{sampleTimestamps:[1],source:'EXTERNAL_MODEL',confidence:.8,modelId:'vision-x',externalProcessing:false}}],analyzerVersion:'mio-video-semantics-v1'});}catch{external=true;}check(external,'External model cannot masquerade as local processing');
 return {passed,total};
}
