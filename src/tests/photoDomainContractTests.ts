import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { compilePhotoCommand, createPhotoDocument, createPhotoNode } from '../creative/photo/PhotoDocumentAdapter';
import { validatePhotoDocument } from '../creative/photo/PhotoDocumentValidation';
interface Result{name:string;passed:boolean;error?:string}
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
export async function runPhotoDomainContractTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('photo domain creates, edits and undoes typed layers',()=>{
  const kernel=new CreativeDocumentKernel(createPhotoDocument('Portrait',1200,800,1,'photo_test'));
  const layer=createPhotoNode('layer_a','Portrait','photo.raster');
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:layer})});
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.opacity',nodeId:'layer_a',opacity:.5})});
  assert(kernel.snapshot().nodes.layer_a.properties.opacity===.5,'opacity command failed');
  kernel.undo();assert(kernel.snapshot().nodes.layer_a.properties.opacity===1,'undo failed');
  kernel.redo();assert(validatePhotoDocument(kernel.snapshot() as any).valid,'photo document invalid after redo');
 }));
 results.push(await test('photo validation rejects invalid opacity',()=>{
  const doc=createPhotoDocument('Invalid',10,10,1,'photo_invalid');const node=createPhotoNode('bad','Bad','photo.raster');node.properties.opacity=2;doc.nodes.bad=node;doc.rootNodeIds=['bad'];assert(!validatePhotoDocument(doc).valid,'invalid opacity accepted');
 }));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
