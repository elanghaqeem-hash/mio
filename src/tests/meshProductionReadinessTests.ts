import type { Mio3DScene, MioPBRMaterial } from '../types/creative';
import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { CreativeDocumentRepository } from '../creative/CreativeDocumentRepository';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { createPrimitiveMesh } from '../modes/studio3d/modeling/MeshPrimitives';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { unwrapMeshCube } from '../modes/studio3d/modeling/MeshUV';
import { SceneMeshEvaluationCache, createMeshEvaluationJob, runMeshEvaluationJob, runMeshEvaluationStress } from '../modes/studio3d/modeling/MeshEvaluationRuntime';
import { exportMioSceneToGlb, importMioSceneFromGlb } from '../modes/studio3d/modeling/MeshGltfExchange';

interface R{name:string;passed:boolean;error?:string}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<R>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
const material:MioPBRMaterial={id:'mat',name:'Production PBR',baseColor:'#4488cc',metalness:0.45,roughness:0.35,emissive:'#000000',emissiveIntensity:0,opacity:1,doubleSided:false};
const productionScene=(arrayCount=1):Mio3DScene=>{
  const mesh=unwrapMeshCube(createPrimitiveMesh('cube')!);
  return{
    objects:[{id:'asset',name:'ProductionAsset',type:'custom',position:[1,2,3],rotation:[0.1,0.2,0.3],scale:[1,1,1],color:'#4488cc',metalness:0.45,roughness:0.35,wireframe:false,mesh,materialSlots:['mat'],modifiers:arrayCount>1?[{id:'array',type:'array',enabled:true,count:arrayCount,offset:[2,0,0]}]:[]}],
    materials:[structuredClone(material)],
    textures:[{id:'unused_tex',name:'Persisted Texture',dataUrl:'data:image/png;base64,iVBORw0KGgo=',colorSpace:'srgb'}],
    camera:{position:[0,2,5],fov:50},
    lights:{ambientColor:'#111111',ambientIntensity:0.6,directionalColor:'#ffffff',directionalIntensity:1},
  };
};

export async function runMeshProductionReadinessTests(){const results:R[]=[];
results.push(await test('authoritative native primitives are deterministic and topology-safe',()=>{
  for(const type of ['cube','cylinder','sphere','torus','plane','mech_core','drone_hull'] as const){
    const a=createPrimitiveMesh(type),b=createPrimitiveMesh(type);assert(Boolean(a&&b),`${type} primitive missing`);assert(JSON.stringify(a)===JSON.stringify(b),`${type} primitive not deterministic`);
    const d=diagnoseMeshTopology(a!);assert(d.valid&&!d.nonManifoldEdgeIds.length&&!d.zeroAreaFaceIds.length&&!d.inconsistentWindingEdgeIds.length&&!d.duplicateFaceGroups.length&&!d.isolatedVertexIds.length,`${type} primitive topology unsafe`);
  }
  assert(createPrimitiveMesh('custom')===null,'custom must not fabricate geometry');
}));
results.push(await test('scene evaluation cache returns immutable clones and invalidates on geometry dependency changes',()=>{
  const scene=productionScene(4),cache=new SceneMeshEvaluationCache(4),first=cache.evaluate(scene,'asset');const originalX=first.mesh.vertices[0].position[0];first.mesh.vertices[0].position[0]=999;
  const second=cache.evaluate(scene,'asset'),afterHit=cache.stats();assert(second.mesh.vertices[0].position[0]===originalX,'cache leaked mutable result');assert(afterHit.hits===1&&afterHit.misses===1,'stable scene should hit cache');
  const changed=structuredClone(scene);changed.objects[0].modifiers=[{id:'array',type:'array',enabled:true,count:5,offset:[2,0,0]}];const third=cache.evaluate(changed,'asset'),afterChange=cache.stats();
  assert(third.mesh.vertices.length!==second.mesh.vertices.length,'changed dependency did not alter evaluated mesh');assert(afterChange.misses===2,'geometry dependency change should miss cache');
}));
results.push(await test('worker-safe evaluation job survives JSON serialization without UI runtime dependencies',()=>{
  const job=createMeshEvaluationJob('job-1',productionScene(3),'asset'),wire=JSON.parse(JSON.stringify(job)),result=runMeshEvaluationJob(wire);
  assert(result.jobId==='job-1'&&result.objectId==='asset','worker job identity preserved');assert(result.result.mesh.vertices.length===24,'worker job evaluates modifier stack');
}));
results.push(await test('stress gate sustains high cache hit rate for repeated heavy scene evaluation',()=>{
  const report=runMeshEvaluationStress(productionScene(16),'asset',500);
  assert(report.misses===1&&report.hits===499,'stress cache reuse failed');assert(report.hitRate>=0.998,'stress cache hit rate below production gate');assert(report.outputVertices===128,'stress output geometry unexpected');
}));
results.push(await test('V5 feature state survives undo redo persistence reopen and GLB round-trip',async()=>{
  const fileName='ProductionReadiness.mio3d',initial=productionScene(1),edited=productionScene(2),id=createCreativeWorkspaceId(fileName),kernel=new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName,initial,100,id));
  kernel.execute({actor:'user',command:createStudioStateCommand(kernel.snapshot(),fileName,edited),timestamp:200});
  const editedState=kernel.snapshot().metadata.legacyData as Mio3DScene;assert(editedState.objects[0].modifiers?.[0]?.type==='array','V5 modifier not recorded');
  kernel.undo();const undone=kernel.snapshot().metadata.legacyData as Mio3DScene;assert((undone.objects[0].modifiers?.length??0)===0,'undo did not restore pre-modifier scene');
  kernel.redo();const redone=kernel.snapshot().metadata.legacyData as Mio3DScene;assert(redone.materials?.[0].id==='mat'&&redone.textures?.[0].id==='unused_tex','redo lost material/texture libraries');
  const repository=new CreativeDocumentRepository(new InMemoryStorageProvider());await repository.save(kernel.snapshot());const reopened=await repository.load(id);assert(Boolean(reopened),'production scene failed to reopen');
  const reopenedScene=reopened!.metadata.legacyData as Mio3DScene;assert(reopenedScene.objects[0].mesh?.faces[0].uvs?.length===4,'UV state lost after reopen');
  const glb=exportMioSceneToGlb(reopenedScene),roundTrip=importMioSceneFromGlb(glb.data);assert(roundTrip.objects[0].mesh?.vertices.length===16,'end-to-end export did not bake array modifier');assert((roundTrip.objects[0].modifiers?.length??0)===0,'round-trip should reopen baked exchange geometry');assert(roundTrip.materials?.[0].id==='mat','round-trip lost material library');
}));
for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
return{passed:results.filter(result=>result.passed).length,total:results.length};
}
