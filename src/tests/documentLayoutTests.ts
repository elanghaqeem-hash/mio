import { normalizeDocumentBox, sortRegionsReadingOrder, validateDocumentLayout, type DocumentRegion } from '../file-intelligence/DocumentLayout';

interface SuiteResult { passed:number; total:number; }
export async function runDocumentLayoutTests():Promise<SuiteResult>{
 let passed=0,total=0; const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`DocumentLayout test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const box=normalizeDocumentBox(1000,2000,{x:100,y:200,width:500,height:400});
 check(Math.abs(box.x-0.1)<1e-9&&Math.abs(box.y-0.1)<1e-9&&Math.abs(box.width-0.5)<1e-9&&Math.abs(box.height-0.2)<1e-9,'Physical coordinates normalize to 0..1 page space');
 const clipped=normalizeDocumentBox(100,100,{x:90,y:90,width:30,height:30});
 check(Math.abs(clipped.width-0.1)<1e-9&&Math.abs(clipped.height-0.1)<1e-9,'Regions extending past page bounds are safely clipped');
 const regions:DocumentRegion[]=[
  {id:'b',pageIndex:0,kind:'PARAGRAPH',box:{x:.1,y:.5,width:.8,height:.1},source:'NATIVE'},
  {id:'a',pageIndex:0,kind:'HEADING',box:{x:.1,y:.1,width:.8,height:.1},source:'NATIVE',confidence:1},
 ];
 const layout=validateDocumentLayout({pageIndex:0,width:1000,height:2000,regions,analyzerVersion:'mio-document-layout-v1'});
 check(layout.regions.length===2,'Valid page layout preserves typed regions');
 check(sortRegionsReadingOrder(regions).map(r=>r.id).join(',')==='a,b','Regions sort deterministically by reading position');
 let duplicate=false; try{validateDocumentLayout({...layout,regions:[regions[0],{...regions[1],id:'b'}]});}catch{duplicate=true;} check(duplicate,'Duplicate region IDs are rejected');
 let confidence=false; try{validateDocumentLayout({...layout,regions:[{...regions[0],confidence:1.1}]});}catch{confidence=true;} check(confidence,'Out-of-range confidence is rejected');
 return {passed,total};
}
