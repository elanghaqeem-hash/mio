import { inferDocumentSemanticsFromText } from '../file-intelligence/DocumentSemanticHeuristics';
import { validateDocumentSemanticAnalysis } from '../file-intelligence/DocumentSemantics';
interface SuiteResult{passed:number;total:number}
export async function runDocumentSemanticHeuristicsTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`DocumentSemanticHeuristics test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const a=inferDocumentSemanticsFromText('Laporan cybersecurity dan risiko perusahaan.',['page:0:p1']);
 check(a.documentType.value==='REPORT','Conservative report keyword classification works');
 check(a.topics.map(t=>t.value).join(',')==='cybersecurity,risk','Grounded topics are emitted deterministically');
 check(validateDocumentSemanticAnalysis(a)===a,'Heuristic output satisfies semantic provenance contract');
 const unknown=inferDocumentSemanticsFromText('Catatan umum tanpa indikator tipe.',['page:0:p2']);
 check(unknown.documentType.value==='UNKNOWN'&&unknown.documentType.evidence.confidence===.35,'Unknown remains low-confidence instead of invented type');
 let empty=false;try{inferDocumentSemanticsFromText('', ['p0']);}catch{empty=true;}check(empty,'Empty evidence text is rejected');
 return {passed,total};
}
