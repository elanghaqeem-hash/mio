import { validateDocumentSemanticAnalysis, type DocumentSemanticAnalysis } from '../file-intelligence/DocumentSemantics';
interface SuiteResult{passed:number;total:number}
export async function runDocumentSemanticsTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`DocumentSemantics test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const native={source:'NATIVE_TEXT' as const,evidenceRefs:['page:0:region:p1'],confidence:.95,externalProcessing:false};
 const analysis:DocumentSemanticAnalysis={documentType:{value:'REPORT',evidence:native},topics:[{value:'cybersecurity',evidence:native}],entities:[{id:'e1',kind:'ORGANIZATION',value:'Mio',evidence:native}],summary:{value:'A bounded summary.',evidence:native},analyzerVersion:'mio-document-semantics-v1'};
 check(validateDocumentSemanticAnalysis(analysis)===analysis,'Grounded native-text semantic analysis validates');
 const external={source:'EXTERNAL_MODEL' as const,evidenceRefs:['page:1:ocr:0'],confidence:.8,modelId:'provider/model',externalProcessing:true};
 check(validateDocumentSemanticAnalysis({...analysis,summary:{value:'External summary',evidence:external}}).summary?.evidence.externalProcessing===true,'External model provenance remains explicit');
 let missingEvidence=false;try{validateDocumentSemanticAnalysis({...analysis,topics:[{value:'risk',evidence:{...native,evidenceRefs:[]}}]});}catch{missingEvidence=true;}check(missingEvidence,'Ungrounded semantic output is rejected');
 let missingModel=false;try{validateDocumentSemanticAnalysis({...analysis,summary:{value:'x',evidence:{source:'LOCAL_MODEL',evidenceRefs:['p0'],confidence:.5,externalProcessing:false}}});}catch{missingModel=true;}check(missingModel,'Model output without modelId is rejected');
 let duplicate=false;try{validateDocumentSemanticAnalysis({...analysis,entities:[analysis.entities[0],{...analysis.entities[0]}]});}catch{duplicate=true;}check(duplicate,'Duplicate semantic entity IDs are rejected');
 return {passed,total};
}
