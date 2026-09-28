import type { Mio3DObject, Mio3DScene, MioMeshData, MioPBRMaterial } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { triangulateMeshFaces } from './MeshGeometryProjection';
import { meshHasCompleteUVs } from './MeshUV';
import { evaluateSceneObjectMesh } from './MeshBooleanSceneBinding';
import { validateSceneMaterials } from './MeshMaterialPipeline';

export const MIO_GLTF_PROFILE='MIO-3D-V5.9';

export interface MioSceneExchangeAnalysis { valid:boolean; errors:string[]; warnings:string[]; }
export interface MioSceneExchangeResult<T> { data:T; warnings:string[]; bakedScene:Mio3DScene; }

interface GltfBuild { document:Record<string,unknown>; binary:Uint8Array; bakedScene:Mio3DScene; warnings:string[]; }

const finiteVector=(value:number[]):boolean=>value.every(Number.isFinite);
const safeMesh=(mesh:MioMeshData):boolean=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)return false;
  const diagnostics=diagnoseMeshTopology(mesh);
  return !diagnostics.nonManifoldEdgeIds.length&&!diagnostics.zeroAreaFaceIds.length&&!diagnostics.inconsistentWindingEdgeIds.length&&!diagnostics.duplicateFaceGroups.length&&!diagnostics.isolatedVertexIds.length;
};
const objectUsesTextures=(scene:Mio3DScene,object:Mio3DObject):boolean=>{
  const materials=new Map((scene.materials??[]).map(material=>[material.id,material] as const));
  return (object.materialSlots??[]).some(id=>{
    const material=materials.get(id);
    return Boolean(material&&(material.baseColorTextureId||material.normalTextureId||material.roughnessTextureId||material.metalnessTextureId||material.emissiveTextureId));
  });
};

export const analyzeMioSceneExchange=(scene:Mio3DScene):MioSceneExchangeAnalysis=>{
  const errors:string[]=[];
  const warnings:string[]=[];
  if(!scene||!Array.isArray(scene.objects)){return{valid:false,errors:['3D scene objects array is required.'],warnings};}
  const objectIds=new Set<string>();
  for(const object of scene.objects){
    if(!object.id.trim())errors.push('Every exported object requires an ID.');
    if(objectIds.has(object.id))errors.push(`Duplicate 3D object ID: ${object.id}.`);
    objectIds.add(object.id);
    if(!object.mesh)errors.push(`Object ${object.id} has no authoritative MioMeshData; V5.9 refuses placeholder geometry export.`);
    if(object.mesh&&(!object.mesh.vertices.length||!object.mesh.faces.length))errors.push(`Object ${object.id} has empty authoritative mesh geometry.`);
    if(!finiteVector(object.position)||!finiteVector(object.rotation)||!finiteVector(object.scale)||object.scale.some(value=>value<=0))errors.push(`Object ${object.id} has invalid transform values.`);
  }
  const materials=validateSceneMaterials(scene);
  errors.push(...materials.errors);
  for(const object of scene.objects){
    if(!object.mesh)continue;
    try{
      const evaluated=evaluateSceneObjectMesh(scene,object.id).mesh;
      const validation=validateMeshTopology(evaluated);
      if(!validation.valid)errors.push(`Object ${object.id} evaluated mesh is invalid: ${validation.errors.join(' ')}`);
      if(!safeMesh(evaluated))errors.push(`Object ${object.id} evaluated mesh failed topology safety checks.`);
      if(objectUsesTextures(scene,object)&&!meshHasCompleteUVs(evaluated))errors.push(`Object ${object.id} uses textures but its evaluated mesh has incomplete UVs.`);
    }catch(error){errors.push(`Object ${object.id} evaluation failed: ${error instanceof Error?error.message:String(error)}`);}
  }
  for(const material of scene.materials??[]){
    if(material.roughnessTextureId||material.metalnessTextureId)warnings.push(`Material ${material.id} uses separate roughness/metalness maps; exact references remain in MIO extras because standard glTF expects a combined metallic-roughness texture.`);
    if(material.emissiveIntensity>1)warnings.push(`Material ${material.id} emissive intensity exceeds core glTF range; exact value remains in MIO extras.`);
  }
  return{valid:errors.length===0,errors,warnings};
};

export const bakeMioSceneForExchange=(scene:Mio3DScene):MioSceneExchangeResult<Mio3DScene>=>{
  const analysis=analyzeMioSceneExchange(scene);
  if(!analysis.valid)throw new Error(`3D exchange validation failed: ${analysis.errors.join(' ')}`);
  const baked:Mio3DScene=structuredClone(scene);
  baked.objects=baked.objects.map(object=>({
    ...object,
    mesh:evaluateSceneObjectMesh(scene,object.id).mesh,
    modifiers:[],
  }));
  return{data:baked,bakedScene:baked,warnings:analysis.warnings};
};

class BinaryBuilder{
  private bytes:number[]=[];
  align4(){while(this.bytes.length%4)this.bytes.push(0);}
  addFloat32(values:number[]):{byteOffset:number;byteLength:number}{
    this.align4();
    const byteOffset=this.bytes.length;
    const buffer=new ArrayBuffer(values.length*4),view=new DataView(buffer);
    values.forEach((value,index)=>view.setFloat32(index*4,value,true));
    this.bytes.push(...new Uint8Array(buffer));
    return{byteOffset,byteLength:buffer.byteLength};
  }
  toBytes():Uint8Array{this.align4();return Uint8Array.from(this.bytes);}
}

const BASE64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const bytesToBase64=(bytes:Uint8Array):string=>{
  let output='';
  for(let index=0;index<bytes.length;index+=3){
    const a=bytes[index],b=index+1<bytes.length?bytes[index+1]:0,c=index+2<bytes.length?bytes[index+2]:0;
    const value=(a<<16)|(b<<8)|c;
    output+=BASE64[(value>>18)&63]+BASE64[(value>>12)&63]+(index+1<bytes.length?BASE64[(value>>6)&63]:'=')+(index+2<bytes.length?BASE64[value&63]:'=');
  }
  return output;
};
const hexToRgb=(hex:string):[number,number,number]=>{
  const value=hex.trim().replace(/^#/,'');
  if(!/^[0-9a-fA-F]{6}$/.test(value))return[1,1,1];
  return[parseInt(value.slice(0,2),16)/255,parseInt(value.slice(2,4),16)/255,parseInt(value.slice(4,6),16)/255];
};
const quaternionFromEulerXYZ=([x,y,z]:[number,number,number]):[number,number,number,number]=>{
  const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2),s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);
  return[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];
};
const accessorBounds=(values:number[],stride:number):{min:number[];max:number[]}=>{
  const min=Array(stride).fill(Infinity),max=Array(stride).fill(-Infinity);
  for(let index=0;index<values.length;index+=stride)for(let component=0;component<stride;component+=1){
    min[component]=Math.min(min[component],values[index+component]);max[component]=Math.max(max[component],values[index+component]);
  }
  return{min,max};
};
const textureIndexMap=(scene:Mio3DScene):Map<string,number>=>new Map((scene.textures??[]).map((texture,index)=>[texture.id,index] as const));

const standardMaterial=(material:MioPBRMaterial,textures:Map<string,number>):Record<string,unknown>=>{
  const rgb=hexToRgb(material.baseColor),emissive=hexToRgb(material.emissive).map(value=>Math.min(1,value*material.emissiveIntensity));
  const pbr:Record<string,unknown>={baseColorFactor:[...rgb,material.opacity],metallicFactor:material.metalness,roughnessFactor:material.roughness};
  const baseTexture=material.baseColorTextureId?textures.get(material.baseColorTextureId):undefined;
  if(baseTexture!==undefined)pbr.baseColorTexture={index:baseTexture};
  const result:Record<string,unknown>={name:material.name,pbrMetallicRoughness:pbr,doubleSided:material.doubleSided,emissiveFactor:emissive};
  const normal=material.normalTextureId?textures.get(material.normalTextureId):undefined;
  if(normal!==undefined)result.normalTexture={index:normal};
  const emissiveMap=material.emissiveTextureId?textures.get(material.emissiveTextureId):undefined;
  if(emissiveMap!==undefined)result.emissiveTexture={index:emissiveMap};
  if(material.opacity<1)result.alphaMode='BLEND';
  return result;
};

const buildGltf=(scene:Mio3DScene,embeddedUri:boolean):GltfBuild=>{
  const bakedResult=bakeMioSceneForExchange(scene),baked=bakedResult.bakedScene,binary=new BinaryBuilder();
  const accessors:Record<string,unknown>[]=[],bufferViews:Record<string,unknown>[]=[],meshes:Record<string,unknown>[]=[],nodes:Record<string,unknown>[]=[];
  const sceneMaterials=baked.materials??[],textures=baked.textures??[],textureMap=textureIndexMap(baked);
  const materials:Record<string,unknown>[]=sceneMaterials.map(material=>standardMaterial(material,textureMap));
  const materialIndex=new Map(sceneMaterials.map((material,index)=>[material.id,index] as const));
  const images=textures.map(texture=>({name:texture.name,uri:texture.dataUrl}));
  const gltfTextures=textures.map((_,index)=>({source:index}));
  const addAccessor=(values:number[],stride:2|3):number=>{
    const chunk=binary.addFloat32(values),viewIndex=bufferViews.length,bounds=accessorBounds(values,stride);
    bufferViews.push({buffer:0,byteOffset:chunk.byteOffset,byteLength:chunk.byteLength,target:34962});
    const accessorIndex=accessors.length;
    accessors.push({bufferView:viewIndex,componentType:5126,count:values.length/stride,type:stride===3?'VEC3':'VEC2',min:bounds.min,max:bounds.max});
    return accessorIndex;
  };
  for(const object of baked.objects){
    const mesh=object.mesh!;
    const faceById=new Map(mesh.faces.map(face=>[face.id,face] as const)),vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex] as const));
    const triangles=triangulateMeshFaces(mesh),slots=[...new Set(triangles.map(triangle=>triangle.materialSlot))].sort((a,b)=>a-b);
    const primitiveList:Record<string,unknown>[]=[];
    let legacyMaterialIndex:number|undefined;
    if(!object.materialSlots?.length){
      legacyMaterialIndex=materials.length;
      materials.push({name:`${object.name} Legacy Material`,pbrMetallicRoughness:{baseColorFactor:[...hexToRgb(object.color),1],metallicFactor:object.metalness,roughnessFactor:object.roughness}});
    }
    for(const slot of slots){
      const positions:number[]=[],uvs:number[]=[];
      let allUv=true;
      for(const triangle of triangles.filter(item=>item.materialSlot===slot)){
        const face=faceById.get(triangle.faceId)!;
        for(const vertexId of triangle.vertexIds){
          const vertex=vertexById.get(vertexId);
          if(!vertex)throw new Error(`Export triangle references missing vertex ${vertexId}.`);
          positions.push(...vertex.position);
          const corner=face.vertexIds.indexOf(vertexId),uv=corner>=0?face.uvs?.[corner]:undefined;
          if(uv)uvs.push(...uv);else allUv=false;
        }
      }
      const attributes:Record<string,number>={POSITION:addAccessor(positions,3)};
      if(allUv&&uvs.length)attributes.TEXCOORD_0=addAccessor(uvs,2);
      const slotMaterialId=object.materialSlots?.[slot];
      const resolvedMaterial=slotMaterialId?materialIndex.get(slotMaterialId):legacyMaterialIndex;
      primitiveList.push({attributes,mode:4,...(resolvedMaterial===undefined?{}:{material:resolvedMaterial})});
    }
    const meshIndex=meshes.length;
    meshes.push({name:object.name,primitives:primitiveList});
    nodes.push({name:object.name,mesh:meshIndex,translation:[...object.position],rotation:quaternionFromEulerXYZ(object.rotation),scale:[...object.scale],extras:{mioObjectId:object.id}});
  }
  const bin=binary.toBytes();
  const buffer:Record<string,unknown>={byteLength:bin.byteLength};
  if(embeddedUri)buffer.uri=`data:application/octet-stream;base64,${bytesToBase64(bin)}`;
  const document:Record<string,unknown>={
    asset:{version:'2.0',generator:'Mio V2 3D Engine V5.9'},
    scene:0,scenes:[{nodes:nodes.map((_,index)=>index)}],nodes,meshes,
    buffers:[buffer],bufferViews,accessors,
    ...(materials.length?{materials}:{}),
    ...(images.length?{images,textures:gltfTextures}:{}),
    extras:{mioProfile:MIO_GLTF_PROFILE,mioScene:baked},
  };
  return{document,binary:bin,bakedScene:baked,warnings:bakedResult.warnings};
};

export const exportMioSceneToGltf=(scene:Mio3DScene):MioSceneExchangeResult<string>=>{
  const built=buildGltf(scene,true);
  return{data:JSON.stringify(built.document),warnings:built.warnings,bakedScene:built.bakedScene};
};

const padded=(bytes:Uint8Array,multiple:number,pad:number):Uint8Array=>{
  const length=Math.ceil(bytes.byteLength/multiple)*multiple,result=new Uint8Array(length);result.set(bytes);result.fill(pad,bytes.byteLength);return result;
};
export const exportMioSceneToGlb=(scene:Mio3DScene):MioSceneExchangeResult<Uint8Array>=>{
  const built=buildGltf(scene,false),encoder=new TextEncoder(),json=padded(encoder.encode(JSON.stringify(built.document)),4,0x20),bin=padded(built.binary,4,0);
  const total=12+8+json.byteLength+8+bin.byteLength,result=new Uint8Array(total),view=new DataView(result.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);
  view.setUint32(12,json.byteLength,true);view.setUint32(16,0x4e4f534a,true);result.set(json,20);
  const binHeader=20+json.byteLength;view.setUint32(binHeader,bin.byteLength,true);view.setUint32(binHeader+4,0x004e4942,true);result.set(bin,binHeader+8);
  return{data:result,warnings:built.warnings,bakedScene:built.bakedScene};
};

const validateImportedProfile=(document:unknown):Mio3DScene=>{
  if(!document||typeof document!=='object')throw new Error('glTF document must be an object.');
  const root=document as {asset?:{version?:unknown};extras?:{mioProfile?:unknown;mioScene?:unknown}};
  if(root.asset?.version!=='2.0')throw new Error('Only glTF 2.0 is supported.');
  if(root.extras?.mioProfile!==MIO_GLTF_PROFILE||!root.extras?.mioScene)throw new Error(`V5.9 import requires ${MIO_GLTF_PROFILE} extras; generic glTF import is not yet enabled.`);
  const scene=structuredClone(root.extras.mioScene) as Mio3DScene,analysis=analyzeMioSceneExchange(scene);
  if(!analysis.valid)throw new Error(`Imported MIO scene failed validation: ${analysis.errors.join(' ')}`);
  return scene;
};

export const importMioSceneFromGltf=(json:string):Mio3DScene=>{
  let document:unknown;
  try{document=JSON.parse(json);}catch{throw new Error('Invalid glTF JSON.');}
  return validateImportedProfile(document);
};
export const importMioSceneFromGlb=(bytes:Uint8Array):Mio3DScene=>{
  if(bytes.byteLength<20)throw new Error('Invalid GLB: file is too small.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw new Error('Invalid GLB 2.0 header.');
  if(view.getUint32(8,true)!==bytes.byteLength)throw new Error('Invalid GLB length header.');
  const jsonLength=view.getUint32(12,true),jsonType=view.getUint32(16,true);
  if(jsonType!==0x4e4f534a||20+jsonLength>bytes.byteLength)throw new Error('Invalid GLB JSON chunk.');
  const json=new TextDecoder().decode(bytes.slice(20,20+jsonLength)).trim();
  return importMioSceneFromGltf(json);
};

const worldPosition=(object:Mio3DObject,position:[number,number,number]):[number,number,number]=>{
  let x=position[0]*object.scale[0],y=position[1]*object.scale[1],z=position[2]*object.scale[2];
  const [rx,ry,rz]=object.rotation,cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  [y,z]=[y*cx-z*sx,y*sx+z*cx];
  [x,z]=[x*cy+z*sy,-x*sy+z*cy];
  [x,y]=[x*cz-y*sz,x*sz+y*cz];
  return[x+object.position[0],y+object.position[1],z+object.position[2]];
};
const objName=(value:string):string=>value.replace(/[^a-zA-Z0-9_.-]+/g,'_')||'Object';

export const serializeMioSceneAsObj=(scene:Mio3DScene):MioSceneExchangeResult<string>=>{
  const bakedResult=bakeMioSceneForExchange(scene),baked=bakedResult.bakedScene;
  let output='# Mio V2 authoritative Wavefront OBJ export\n',vertexOffset=1,uvOffset=1;
  for(const object of baked.objects){
    const mesh=object.mesh!,vertexIndex=new Map(mesh.vertices.map((vertex,index)=>[vertex.id,vertexOffset+index] as const));
    output+=`o ${objName(object.name)}\n`;
    for(const vertex of mesh.vertices){const p=worldPosition(object,vertex.position);output+=`v ${p.map(value=>value.toFixed(6)).join(' ')}\n`;}
    for(const face of mesh.faces){
      const slot=face.materialSlot??0,materialId=object.materialSlots?.[slot];
      output+=`usemtl ${objName(materialId??`legacy_${object.id}`)}\n`;
      if(face.uvs?.length===face.vertexIds.length){
        const refs:string[]=[];
        for(let index=0;index<face.vertexIds.length;index+=1){const uv=face.uvs[index];output+=`vt ${uv[0].toFixed(6)} ${uv[1].toFixed(6)}\n`;refs.push(`${vertexIndex.get(face.vertexIds[index])}/${uvOffset++}`);}
        output+=`f ${refs.join(' ')}\n`;
      }else output+=`f ${face.vertexIds.map(id=>vertexIndex.get(id)).join(' ')}\n`;
    }
    vertexOffset+=mesh.vertices.length;
  }
  return{data:output,warnings:bakedResult.warnings,bakedScene:baked};
};
