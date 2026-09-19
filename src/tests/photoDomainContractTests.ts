import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { compilePhotoCommand, createPhotoDocument, createPhotoNode } from '../creative/photo/PhotoDocumentAdapter';
import { validatePhotoDocument } from '../creative/photo/PhotoDocumentValidation';
import { PhotoTransactionEngine } from '../creative/photo/PhotoTransactionEngine';
import { buildPhotoRenderGraph, collectDirtyRenderNodes, topologicalPhotoRenderOrder, createPhotoRenderInvalidation } from '../creative/photo/PhotoRenderGraph';
import { createPhotoRenderExecutionPlan } from '../creative/photo/PhotoRenderExecutionPlan';
import { PhotoTileCache, photoTilesForRegion } from '../creative/photo/PhotoTileCache';
interface Result{name:string;passed:boolean;error?:string}
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
export async function runPhotoDomainContractTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('photo tile engine maps edge regions and evicts deterministically',()=>{const tiles=photoTilesForRegion('doc',1,{width:600,height:300},{x:500,y:250,width:100,height:50},256);assert(tiles.length===4,'edge region should map to four intersecting tiles');const edge=tiles.find(t=>t.coordinate.x===2&&t.coordinate.y===1);assert(edge?.bounds.width===88&&edge?.bounds.height===44,'edge tile bounds incorrect');const cache=new PhotoTileCache<string>(2,10);cache.set('a','A',4);cache.set('b','B',4);cache.get('a');cache.set('c','C',4);assert(cache.has('a')&&!cache.has('b')&&cache.has('c'),'LRU eviction incorrect');assert(cache.bytes===8,'byte accounting incorrect');}));
 results.push(await test('photo execution plan clips regions and skips cached tasks',()=>{const kernel=new CreativeDocumentKernel(createPhotoDocument('Plan',100,80,1,'plan_test'));kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:createPhotoNode('layer','Layer','photo.raster')})});const graph=buildPhotoRenderGraph(kernel.snapshot() as any),inv=createPhotoRenderInvalidation(graph,{affectedNodeIds:['layer'],renderHints:['pixels']},{x:-5,y:10,width:20,height:100});const plan=createPhotoRenderExecutionPlan(graph,inv,{canvas:{width:100,height:80}});assert(plan.tasks.length===1,'render task missing');assert(plan.tasks[0].region?.x===0&&plan.tasks[0].region?.height===70,'dirty region not clipped');const cached=createPhotoRenderExecutionPlan(graph,inv,{cachedKeys:new Set([plan.tasks[0].cacheKey])});assert(cached.tasks.length===0,'cached render task was not eliminated');}));
 results.push(await test('photo render invalidation preserves transaction hints and dirty region',()=>{const kernel=new CreativeDocumentKernel(createPhotoDocument('Invalidate',100,100,1,'invalidate_test'));kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:createPhotoNode('layer','Layer','photo.raster')})});const graph=buildPhotoRenderGraph(kernel.snapshot() as any);const invalidation=createPhotoRenderInvalidation(graph,{affectedNodeIds:['layer'],renderHints:['pixels','mask','pixels']},{x:4,y:5,width:20,height:10});assert(invalidation.nodeIds[0]==='layer','affected layer missing');assert(invalidation.kinds.length===2,'render hints were not deduplicated');assert(invalidation.region?.width===20,'dirty region lost');}));
 results.push(await test('photo render graph orders dependencies and propagates dirtiness',()=>{const doc=createPhotoDocument('Render',100,100,1,'render_test');const kernel=new CreativeDocumentKernel(doc);kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:createPhotoNode('base','Base','photo.raster')})});kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:{...createPhotoNode('clip','Clip','photo.raster'),properties:{...createPhotoNode('clip','Clip','photo.raster').properties,clippingTargetId:'base'}}})});const graph=buildPhotoRenderGraph(kernel.snapshot() as any);const order=topologicalPhotoRenderOrder(graph);assert(order.indexOf('base')<order.indexOf('clip'),'dependency rendered after dependent');assert(collectDirtyRenderNodes(graph,['base']).has('clip'),'dirty dependency did not propagate');}));
 results.push(await test('photo domain creates, edits and undoes typed layers',()=>{
  const kernel=new CreativeDocumentKernel(createPhotoDocument('Portrait',1200,800,1,'photo_test'));
  const layer=createPhotoNode('layer_a','Portrait','photo.raster');
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:layer})});
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.opacity',nodeId:'layer_a',opacity:.5})});
  assert(kernel.snapshot().nodes.layer_a.properties.opacity===.5,'opacity command failed');
  kernel.undo();assert(kernel.snapshot().nodes.layer_a.properties.opacity===1,'undo failed');
  kernel.redo();assert(validatePhotoDocument(kernel.snapshot() as any).valid,'photo document invalid after redo');
 }));
 results.push(await test('photo masks and adjustments are undoable',()=>{
  const kernel=new CreativeDocumentKernel(createPhotoDocument('Retouch',100,100,1,'photo_semantics'));
  const layer=createPhotoNode('layer','Layer','photo.raster');kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.layer.create',node:layer})});
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.mask.attach',nodeId:'layer',mask:{id:'mask',kind:'pixel',enabled:true,inverted:false,feather:0,density:1}})});
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.mask.update',nodeId:'layer',maskId:'mask',changes:{feather:8,density:.7}})});
  assert((kernel.snapshot().nodes.layer.properties as any).masks[0].feather===8,'mask update failed');kernel.undo();assert((kernel.snapshot().nodes.layer.properties as any).masks[0].feather===0,'mask undo failed');kernel.redo();
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.adjustment.add',nodeId:'layer',adjustment:{id:'exp',kind:'exposure',enabled:true,parameters:{exposure:.5}}})});
  kernel.execute({command:compilePhotoCommand(kernel.snapshot(),{type:'photo.adjustment.remove',nodeId:'layer',adjustmentId:'exp'})});assert((kernel.snapshot().nodes.layer.properties as any).adjustments.length===0,'adjustment removal failed');kernel.undo();assert((kernel.snapshot().nodes.layer.properties as any).adjustments.length===1,'adjustment undo failed');
 }));
 results.push(await test('photo semantics reject duplicate masks invalid sources and clipping cycles',()=>{
  const doc=createPhotoDocument('Rules',100,100,1,'photo_rules'),a=createPhotoNode('a','A','photo.raster'),b=createPhotoNode('b','B','photo.raster');doc.nodes.a=a;doc.nodes.b=b;doc.rootNodeIds=['a','b'];
  const mask={id:'same',kind:'pixel' as const,enabled:true,inverted:false,feather:0,density:1};a.properties.masks=[mask,{...mask}];assert(!validatePhotoDocument(doc).valid,'duplicate masks accepted');a.properties.masks=[];
  let rejected=false;try{compilePhotoCommand(doc,{type:'photo.layer.bindSource',nodeId:'a',assetId:'missing'})}catch{rejected=true}assert(rejected,'missing source asset accepted');
  (b.properties as any).clippingTargetId='a';rejected=false;try{compilePhotoCommand(doc,{type:'photo.layer.clip',nodeId:'a',targetId:'b'})}catch{rejected=true}assert(rejected,'clipping cycle accepted');
 }));
 results.push(await test('photo transaction commits multiple commands as one undoable history entry',()=>{
  const kernel=new CreativeDocumentKernel(createPhotoDocument('Tx',100,100,1,'photo_tx'));const tx=new PhotoTransactionEngine(kernel);
  const layer=createPhotoNode('tx_layer','Layer','photo.raster');
  tx.execute({id:'tx_create_edit',metadata:{label:'Create and edit layer',source:'manual',affectedNodeIds:['tx_layer'],renderHints:['composite']},commands:[{type:'photo.layer.create',node:layer},{type:'photo.layer.opacity',nodeId:'tx_layer',opacity:.4}]});
  assert(tx.snapshot().nodes.tx_layer.properties.opacity===.4,'transaction commands not applied');
  tx.undo();assert(!tx.snapshot().nodes.tx_layer,'transaction undo was not atomic');
  tx.redo();assert(tx.snapshot().nodes.tx_layer.properties.opacity===.4,'transaction redo failed');
 }));
 results.push(await test('photo transaction compilation is atomic on invalid nested command',()=>{
  const kernel=new CreativeDocumentKernel(createPhotoDocument('TxFail',100,100,1,'photo_tx_fail'));const tx=new PhotoTransactionEngine(kernel);
  let rejected=false;try{tx.execute({id:'bad_tx',metadata:{label:'Bad transaction',source:'ai'},commands:[{type:'photo.layer.create',node:createPhotoNode('safe','Safe','photo.raster')},{type:'photo.layer.opacity',nodeId:'missing',opacity:.5}]})}catch{rejected=true}
  assert(rejected,'invalid transaction accepted');assert(!tx.snapshot().nodes.safe,'failed transaction mutated live document');
 }));
 results.push(await test('photo validation rejects invalid opacity',()=>{
  const doc=createPhotoDocument('Invalid',10,10,1,'photo_invalid');const node=createPhotoNode('bad','Bad','photo.raster');node.properties.opacity=2;doc.nodes.bad=node;doc.rootNodeIds=['bad'];assert(!validatePhotoDocument(doc).valid,'invalid opacity accepted');
 }));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
