import type { Mio3DObject, Mio3DScene, MioPBRMaterial } from '../types/creative';
import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { unwrapMeshCube } from '../modes/studio3d/modeling/MeshUV';
import { analyzeMioSceneExchange, exportMioSceneToGlb, exportMioSceneToGltf, importMioSceneFromGlb, importMioSceneFromGltf, serializeMioSceneAsObj } from '../modes/studio3d/modeling/MeshGltfExchange';

interface R{name:string;passed:boolean;error?:string}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<R>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
const mats:MioPBRMaterial[]=[
  {id:'mat0',name:'Base',baseColor:'#336699',metalness:0.2,roughness:0.7,emissive:'#000000',emissiveIntensity:0,opacity:1,doubleSided:false},
  {id:'mat1',name:'Accent',baseColor:'#ffffff',metalness:0.8,roughness:0.25,emissive:'#000000',emissiveIntensity:0,opacity:1,doubleSided:false},
];
const object=(id='obj'):Mio3DObject=>{
  const mesh=unwrapMeshCube(createCubeMesh());
  mesh.faces[0].materialSlot=1;
  return{id,name:id,type:'custom',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#336699',metalness:0.2,roughness:0.7,wireframe:false,mesh,materialSlots:['mat0','mat1'],modifiers:[]};
};
const scene=(o=object()):Mio3DScene=>({objects:[o],materials:structuredClone(mats),textures:[],camera:{position:[0,2,5],fov:50},lights:{ambientColor:'#111111',ambientIntensity:0.5,directionalColor:'#ffffff',directionalIntensity:1}});

export async function runMeshGltfExchangeTests(){const results:R[]=[];
results.push(await test('glTF export is deterministic and exact MIO round-trip bakes modifiers',()=>{
  const o=object();o.modifiers=[{id:'array',type:'array',enabled:true,count:2,offset:[2,0,0]}];
  const s=scene(o),before=JSON.stringify(s),first=exportMioSceneToGltf(s),second=exportMioSceneToGltf(s),imported=importMioSceneFromGltf(first.data),document=JSON.parse(first.data);
  assert(first.data===second.data,'glTF JSON deterministic');
  assert(String(document.buffers[0].uri).startsWith('data:application/octet-stream;base64,'),'binary buffer embedded');
  assert(imported.objects[0].mesh?.vertices.length===16,'array modifier baked into exported mesh');
  assert(imported.objects[0].modifiers?.length===0,'baked export clears modifier stack');
  assert(imported.objects[0].materialSlots?.join(',')==='mat0,mat1','material slots round-trip');
  assert(JSON.stringify(s)===before,'source scene immutable');
}));
results.push(await test('GLB export is deterministic valid and round-trips MIO profile',()=>{
  const s=scene(),a=exportMioSceneToGlb(s),b=exportMioSceneToGlb(s);
  assert(a.data.byteLength===b.data.byteLength&&a.data.every((value,index)=>value===b.data[index]),'GLB deterministic byte-for-byte');
  const view=new DataView(a.data.buffer,a.data.byteOffset,a.data.byteLength);
  assert(view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2,'GLB 2.0 header');
  const imported=importMioSceneFromGlb(a.data);
  assert(imported.objects[0].mesh?.faces.length===6,'GLB MIO scene round-trip');
}));
results.push(await test('OBJ serializer uses actual evaluated Mio mesh and world transform',()=>{
  const o=object();o.position=[2,0,0];const result=serializeMioSceneAsObj(scene(o)),vertices=result.data.split('\n').filter(line=>line.startsWith('v '));
  assert(vertices.length===8,'exports actual cube vertex count');
  assert(vertices.includes('v 1.500000 -0.500000 -0.500000'),'object translation applied to actual mesh vertex');
  assert(result.data.includes('vt '),'per-corner UV coordinates exported');
  assert(result.data.includes('usemtl mat1'),'face material slot exported');
}));
results.push(await test('exchange rejects non-authoritative and generic unsupported imports explicitly',()=>{
  const procedural=object();delete procedural.mesh;
  const analysis=analyzeMioSceneExchange(scene(procedural));
  assert(!analysis.valid&&analysis.errors.some(error=>error.includes('no authoritative MioMeshData')),'placeholder geometry rejected');
  let genericRejected=false;try{importMioSceneFromGltf(JSON.stringify({asset:{version:'2.0'},scenes:[{}]}))}catch(error){genericRejected=String(error).includes('generic glTF import is not yet enabled')}
  assert(genericRejected,'generic glTF rejection is explicit');
}));
for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
return{passed:results.filter(result=>result.passed).length,total:results.length};
}
