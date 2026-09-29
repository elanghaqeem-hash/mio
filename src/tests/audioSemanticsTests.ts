import { validateAudioSemanticAnalysis } from '../file-intelligence/AudioSemantics';
interface SuiteResult{passed:number;total:number}
export async function runAudioSemanticsTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`AudioSemantics test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const a=validateAudioSemanticAnalysis({insights:[{kind:'TOPIC',text:'cybersecurity',evidence:{segmentIndexes:[0],source:'TRANSCRIPT_HEURISTIC',confidence:.8,externalProcessing:false}}],analyzerVersion:'mio-audio-semantics-v1'},2);
 check(a.insights[0].text==='cybersecurity','Transcript-grounded topic validates');
 let badRef=false;try{validateAudioSemanticAnalysis({...a,insights:[{...a.insights[0],evidence:{...a.insights[0].evidence,segmentIndexes:[2]}}]},2);}catch{badRef=true;}check(badRef,'Out-of-range transcript evidence is rejected');
 let model=false;try{validateAudioSemanticAnalysis({insights:[{kind:'SUMMARY',text:'summary',evidence:{segmentIndexes:[0],source:'LOCAL_MODEL',confidence:.8,externalProcessing:false}}],analyzerVersion:'mio-audio-semantics-v1'},1);}catch{model=true;}check(model,'Model insight requires model identity');
 let external=false;try{validateAudioSemanticAnalysis({insights:[{kind:'KEYWORD',text:'risk',evidence:{segmentIndexes:[0],source:'EXTERNAL_MODEL',confidence:.8,modelId:'llm-x',externalProcessing:false}}],analyzerVersion:'mio-audio-semantics-v1'},1);}catch{external=true;}check(external,'External model cannot masquerade as local');
 return {passed,total};
}
