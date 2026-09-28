import type { Mio3DObject, Mio3DScene, MioPBRMaterial, MioTextureReference } from '../types/creative';
import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { unwrapMeshCube } from '../modes/studio3d/modeling/MeshUV';
import { projectMeshToBufferGeometry } from '../modes/studio3d/modeling/MeshGeometryProjection';
import { resolveObjectMaterialSlots, validateSceneMaterials } from '../modes/studio3d/modeling/MeshMaterialPipeline';

interface R{name:string;passed:boolean;error?:string}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<R>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
const dataUrl='data:image/png;base64,iVBORw0KGgo=';
const material=(id:string,textureId?:string):MioPBRMaterial=>({id,name:id,baseColor:'#ffffff',metalness:0.4,roughness:0.6,emissive:'#000000',emissiveIntensity:0,opacity:1,doubleSided:false,...(textureId?{baseColorTextureId:textureId}:{})});
const object=(mesh=unwrapMeshCube(createCubeMesh())):Mio3DObject=>({id:'obj',name:'Object',type:'custom',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#123456',metalness:0.2,roughness:0.8,wireframe:false,mesh,materialSlots:['mat0','mat1']});
const scene=(o:Mio3DObject,materials:MioPBRMaterial[],textures:MioTextureReference[]=[]):Mio3DScene=>({objects:[o],materials,textures,camera:{position:[0,0,5],fov:50},lights:{ambientColor:'#000000',ambientIntensity:1,directionalColor:'#ffffff',directionalIntensity:1}});

export async function runMeshMaterialPipelineTests(){const results:R[]=[];
results.push(await test('resolves PBR slots and embedded texture references deterministically',()=>{const mesh=unwrapMeshCube(createCubeMesh());mesh.faces[0].materialSlot=1;const o=object(mesh),texture:MioTextureReference={id:'tex',name:'Texture',dataUrl,colorSpace:'srgb'},s=scene(o,[material('mat0'),material('mat1','tex')],[texture]),validation=validateSceneMaterials(s),slots=resolveObjectMaterialSlots(s,o),roundTrip=JSON.parse(JSON.stringify(s)) as Mio3DScene;assert(validation.valid,'scene material contract valid');assert(slots.length===2&&slots[1].baseColorTextureDataUrl===dataUrl,'texture resolved into slot');assert(validateSceneMaterials(roundTrip).valid,'material and texture data survives JSON round-trip')}));
results.push(await test('projects face material slots into BufferGeometry groups',()=>{const mesh=unwrapMeshCube(createCubeMesh());mesh.faces[0].materialSlot=1;mesh.faces[1].materialSlot=1;const projection=projectMeshToBufferGeometry(mesh);assert(projection.triangleMaterialSlots.includes(1),'triangle material slot preserved');assert(projection.geometry.groups.some(group=>group.materialIndex===1),'geometry group targets second material slot');projection.geometry.dispose()}));
results.push(await test('rejects missing materials invalid slots and unsafe texture references',()=>{const o=object();const missing=scene(o,[material('mat0')]);let badMissing=!validateSceneMaterials(missing).valid;const badSlot=object();badSlot.materialSlots=['mat0'];badSlot.mesh!.faces[0].materialSlot=2;let badIndex=!validateSceneMaterials(scene(badSlot,[material('mat0')])).valid;const invalidTexture:MioTextureReference={id:'t',name:'Bad',dataUrl:'https://example.com/x.png',colorSpace:'srgb'};let badTexture=!validateSceneMaterials(scene({...o,materialSlots:['mat0']},[material('mat0','t')],[invalidTexture])).valid;assert(badMissing&&badIndex&&badTexture,'invalid references rejected')}));
results.push(await test('keeps legacy object material as backward-compatible fallback',()=>{const o=object();delete o.materialSlots;const slots=resolveObjectMaterialSlots(scene(o,[]),o);assert(slots.length===1&&slots[0].baseColor===o.color&&slots[0].metalness===o.metalness,'legacy fallback preserved')}));
for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
return{passed:results.filter(result=>result.passed).length,total:results.length};
}
