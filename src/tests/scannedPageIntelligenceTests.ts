import { createOcrResult } from '../file-intelligence/OcrTextIntelligence';
import { mapOcrToDocumentPage } from '../file-intelligence/ScannedPageIntelligence';

interface SuiteResult { passed:number; total:number; }
export async function runScannedPageIntelligenceTests():Promise<SuiteResult>{
 let passed=0,total=0; const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`ScannedPage test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const ocr=createOcrResult({source:'LOCAL_ENGINE',engineId:'test-local-ocr',language:'id',regions:[
  {text:'Baris kedua',confidence:.9,x:.1,y:.5,width:.7,height:.1},
  {text:'Judul',confidence:.98,x:.1,y:.1,width:.4,height:.08},
 ]});
 const page=mapOcrToDocumentPage(2,1200,1600,ocr);
 check(page.layout.regions.every(r=>r.source==='OCR'&&r.pageIndex===2),'OCR regions preserve explicit OCR provenance');
 check(page.layout.regions.map(r=>r.text).join('|')==='Judul|Baris kedua','OCR regions are normalized into deterministic reading order');
 check(page.ocrEngineId==='test-local-ocr'&&!page.externalProcessing,'Local OCR engine provenance remains local');
 const external=createOcrResult({source:'EXTERNAL_ENGINE',engineId:'remote-vision',regions:[{text:'Invoice',confidence:.8,x:0,y:0,width:1,height:.2}]});
 check(mapOcrToDocumentPage(0,100,100,external).externalProcessing,'External OCR provenance remains externally processed');
 let invalid=false; try{mapOcrToDocumentPage(-1,100,100,ocr);}catch{invalid=true;} check(invalid,'Invalid page index is rejected');
 return {passed,total};
}
