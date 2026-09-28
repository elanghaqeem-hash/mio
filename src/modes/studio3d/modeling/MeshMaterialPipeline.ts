import type { Mio3DObject, Mio3DScene, MioPBRMaterial, MioTextureReference } from '../../../types/creative';

export interface ResolvedPBRMaterial {
  id:string;
  name:string;
  baseColor:string;
  metalness:number;
  roughness:number;
  emissive:string;
  emissiveIntensity:number;
  opacity:number;
  doubleSided:boolean;
  baseColorTextureDataUrl?:string;
  normalTextureDataUrl?:string;
  roughnessTextureDataUrl?:string;
  metalnessTextureDataUrl?:string;
  emissiveTextureDataUrl?:string;
}

export interface MaterialValidationResult { valid:boolean; errors:string[]; }

const finiteUnit=(value:number):boolean=>Number.isFinite(value)&&value>=0&&value<=1;
const dataImage=(value:string):boolean=>/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
const uniqueIds=(items:{id:string}[]):boolean=>new Set(items.map(item=>item.id)).size===items.length;

const textureById=(scene:Mio3DScene):Map<string,MioTextureReference>=>new Map((scene.textures??[]).map(texture=>[texture.id,texture] as const));
const materialById=(scene:Mio3DScene):Map<string,MioPBRMaterial>=>new Map((scene.materials??[]).map(material=>[material.id,material] as const));

export const validateSceneMaterials=(scene:Mio3DScene):MaterialValidationResult=>{
  const errors:string[]=[];
  const textures=scene.textures??[],materials=scene.materials??[];
  if(!uniqueIds(textures))errors.push('Texture IDs must be unique.');
  if(!uniqueIds(materials))errors.push('Material IDs must be unique.');
  const texturesById=textureById(scene),materialsById=materialById(scene);
  for(const texture of textures){
    if(!texture.id.trim())errors.push('Texture ID is required.');
    if(!texture.name.trim())errors.push(`Texture ${texture.id} requires a name.`);
    if(!dataImage(texture.dataUrl))errors.push(`Texture ${texture.id} must use an embedded data:image base64 URL.`);
  }
  for(const material of materials){
    if(!material.id.trim())errors.push('Material ID is required.');
    if(!material.name.trim())errors.push(`Material ${material.id} requires a name.`);
    if(!finiteUnit(material.metalness))errors.push(`Material ${material.id} metalness must be within 0..1.`);
    if(!finiteUnit(material.roughness))errors.push(`Material ${material.id} roughness must be within 0..1.`);
    if(!finiteUnit(material.opacity))errors.push(`Material ${material.id} opacity must be within 0..1.`);
    if(!Number.isFinite(material.emissiveIntensity)||material.emissiveIntensity<0)errors.push(`Material ${material.id} emissive intensity must be a non-negative finite number.`);
    for(const textureId of [material.baseColorTextureId,material.normalTextureId,material.roughnessTextureId,material.metalnessTextureId,material.emissiveTextureId]){
      if(textureId&&!texturesById.has(textureId))errors.push(`Material ${material.id} references missing texture ${textureId}.`);
    }
  }
  for(const object of scene.objects){
    for(const materialId of object.materialSlots??[])if(!materialsById.has(materialId))errors.push(`Object ${object.id} references missing material ${materialId}.`);
    if(object.mesh&&object.materialSlots?.length){
      for(const face of object.mesh.faces){
        const slot=face.materialSlot??0;
        if(!Number.isInteger(slot)||slot<0||slot>=object.materialSlots.length)errors.push(`Face ${face.id} on object ${object.id} references invalid material slot ${slot}.`);
      }
    }
  }
  return{valid:errors.length===0,errors};
};

const resolveTexture=(textures:Map<string,MioTextureReference>,id?:string):string|undefined=>id?textures.get(id)?.dataUrl:undefined;

export const resolveObjectMaterialSlots=(scene:Mio3DScene,object:Mio3DObject):ResolvedPBRMaterial[]=>{
  const validation=validateSceneMaterials(scene);
  if(!validation.valid)throw new Error(`Invalid 3D material pipeline: ${validation.errors.join(' ')}`);
  const slots=object.materialSlots??[];
  if(!slots.length){
    return[{
      id:`legacy:${object.id}`,name:`${object.name} Legacy Material`,baseColor:object.color,
      metalness:object.metalness,roughness:object.roughness,emissive:'#000000',emissiveIntensity:0,
      opacity:1,doubleSided:false,
    }];
  }
  const materials=materialById(scene),textures=textureById(scene);
  return slots.map(id=>{
    const material=materials.get(id);
    if(!material)throw new Error(`Object ${object.id} references missing material ${id}.`);
    return{
      id:material.id,name:material.name,baseColor:material.baseColor,metalness:material.metalness,roughness:material.roughness,
      emissive:material.emissive,emissiveIntensity:material.emissiveIntensity,opacity:material.opacity,doubleSided:material.doubleSided,
      baseColorTextureDataUrl:resolveTexture(textures,material.baseColorTextureId),
      normalTextureDataUrl:resolveTexture(textures,material.normalTextureId),
      roughnessTextureDataUrl:resolveTexture(textures,material.roughnessTextureId),
      metalnessTextureDataUrl:resolveTexture(textures,material.metalnessTextureId),
      emissiveTextureDataUrl:resolveTexture(textures,material.emissiveTextureId),
    };
  });
};
