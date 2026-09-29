import type { DocumentSemanticAnalysis, DocumentType, SemanticEvidence } from './DocumentSemantics';

const evidence=(refs:string[],confidence:number):SemanticEvidence=>({source:'LOCAL_HEURISTIC',evidenceRefs:refs,confidence,externalProcessing:false});
const has=(text:string,re:RegExp)=>re.test(text);
export function inferDocumentSemanticsFromText(text:string,evidenceRefs:string[]):DocumentSemanticAnalysis{
 const normalized=text.normalize('NFKC').replace(/\s+/gu,' ').trim();
 if(!normalized||evidenceRefs.length===0) throw new Error('Heuristic semantics require text and evidence references');
 let type:DocumentType='UNKNOWN', confidence=.35;
 const rules:Array<[DocumentType,RegExp,number]>=[
  ['INVOICE',/\b(invoice|faktur|tagihan)\b/i,.82],['RECEIPT',/\b(receipt|kwitansi|struk)\b/i,.82],
  ['CONTRACT',/\b(contract|agreement|perjanjian|para pihak)\b/i,.72],['POLICY',/\b(policy|kebijakan)\b/i,.68],
  ['MEETING_NOTES',/\b(minutes of meeting|meeting notes|notulen|risalah rapat)\b/i,.78],
  ['MANUAL',/\b(user manual|pedoman|panduan)\b/i,.65],['REPORT',/\b(report|laporan|executive summary)\b/i,.62],
 ];
 for(const [candidate,re,score] of rules)if(has(normalized,re)&&score>confidence){type=candidate;confidence=score;}
 const topics:string[]=[];
 for(const [topic,re] of [['cybersecurity',/\b(cyber|security|keamanan siber)\b/i],['risk',/\b(risk|risiko)\b/i],['finance',/\b(finance|financial|keuangan|revenue|pendapatan)\b/i],['privacy',/\b(privacy|data pribadi|pelindungan data)\b/i]] as const)if(has(normalized,re))topics.push(topic);
 return {documentType:{value:type,evidence:evidence(evidenceRefs,confidence)},topics:topics.map(value=>({value,evidence:evidence(evidenceRefs,.6)})),entities:[],analyzerVersion:'mio-document-semantics-v1'};
}
