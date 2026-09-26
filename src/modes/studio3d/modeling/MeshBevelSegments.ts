import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';

export interface MeshBevelSegmentResult {
  mesh:MioMeshData;
  bevelFaceIds:string[];
  createdVertexIds:string[];
  segments:number;
  profile:number;
  curvature:number;
}

type Vec3=[number,number,number];
const uniqueId=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i+=1;return `${base}_${i}`};
const mixPosition=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(a:Vec3,s:number):Vec3=>[a[0]*s,a[1]*s,a[2]*s];
const normalize=(a:Vec3):Vec3=>{const l=Math.hypot(a[0],a[1],a[2]);return l>1e-12?[a[0]/l,a[1]/l,a[2]/l]:[0,0,0]};
const faceNormal=(face:MioMeshFace,vertexById:Map<string,MioMeshVertex>):Vec3=>{
  let x=0,y=0,z=0;
  for(let i=0;i<face.vertexIds.length;i+=1){const a=vertexById.get(face.vertexIds[i])!.position,b=vertexById.get(face.vertexIds[(i+1)%face.vertexIds.length])!.position;x+=(a[1]-b[1])*(a[2]+b[2]);y+=(a[2]-b[2])*(a[0]+b[0]);z+=(a[0]-b[0])*(a[1]+b[1]);}
  return normalize([x,y,z]);
};
const sectionKey=(a:string,b:string,index:number,segments:number):string=>a<b?`${a}|${b}|${index}/${segments}`:`${b}|${a}|${segments-index}/${segments}`;

export const bevelProfileParameter=(t:number,profile:number):number=>{
  if(!Number.isFinite(t)||t<0||t>1)throw new Error('Bevel profile parameter t must be within 0..1.');
  if(!Number.isFinite(profile)||profile<=0||profile>=1)throw new Error('Bevel profile must be greater than 0 and less than 1.');
  if(t===0||t===1)return t;
  const exponent=Math.pow(2,(profile-0.5)*4);
  const a=Math.pow(t,exponent),b=Math.pow(1-t,exponent);
  return a/(a+b);
};

export const segmentBevelFaces=(mesh:MioMeshData,bevelFaceIds:string[],segments:number,profile=0.5,curvature=0):MeshBevelSegmentResult=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  if(!Number.isInteger(segments)||segments<1||segments>16)throw new Error('Bevel segments must be an integer from 1 to 16.');
  if(!Number.isFinite(profile)||profile<=0||profile>=1)throw new Error('Bevel profile must be greater than 0 and less than 1.');
  if(!Number.isFinite(curvature)||curvature<0||curvature>1)throw new Error('Bevel curvature must be within 0..1.');
  const selected=new Set(bevelFaceIds);
  if(!selected.size)throw new Error('Segment Bevel requires at least one bevel face.');
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  for(const id of selected){const face=faceById.get(id);if(!face)throw new Error(`Bevel face ${id} does not exist.`);if(face.vertexIds.length!==4)throw new Error(`Bevel face ${id} must be a quad.`)}
  if(segments===1)return{mesh:structuredClone(mesh),bevelFaceIds:[...bevelFaceIds],createdVertexIds:[],segments,profile,curvature};

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(face=>face.id));
  const createdByKey=new Map<string,MioMeshVertex>();
  const normalSums=new Map<string,Vec3>();
  const replacementFaces:MioMeshFace[]=[];
  const resultFaceIds:string[]=[];

  const interiorId=(aId:string,bId:string,index:number,faceId:string):string=>{
    const key=sectionKey(aId,bId,index,segments);
    const existing=createdByKey.get(key);
    if(existing)return existing.id;
    const aVertex=vertexById.get(aId)!,bVertex=vertexById.get(bId)!;
    const orientedIndex=aId<bId?index:segments-index;
    const t=bevelProfileParameter(orientedIndex/segments,profile);
    const id=uniqueId(`bevel_segment_${createdByKey.size+1}`,usedVertexIds);usedVertexIds.add(id);
    const vertex={id,position:mixPosition(aVertex.position,bVertex.position,t)} satisfies MioMeshVertex;
    createdByKey.set(key,vertex);
    normalSums.set(key,[0,0,0]);
    return id;
  };

  for(const faceId of bevelFaceIds){
    const face=faceById.get(faceId)!;
    const [end0,start0,start1,end1]=face.vertexIds;
    const normal=faceNormal(face,vertexById);
    const startIds=[start0],endIds=[end0];
    for(let index=1;index<segments;index+=1){
      const sid=interiorId(start0,start1,index,faceId);
      const eid=interiorId(end0,end1,index,faceId);
      startIds.push(sid);endIds.push(eid);
      const sk=sectionKey(start0,start1,index,segments),ek=sectionKey(end0,end1,index,segments);
      normalSums.set(sk,add(normalSums.get(sk)!,normal));
      normalSums.set(ek,add(normalSums.get(ek)!,normal));
    }
    startIds.push(start1);endIds.push(end1);
    for(let index=0;index<segments;index+=1){
      const id=uniqueId(`${faceId}_segment_face_${index+1}`,usedFaceIds);usedFaceIds.add(id);
      replacementFaces.push({id,vertexIds:[endIds[index],startIds[index],startIds[index+1],endIds[index+1]],...(face.materialSlot===undefined?{}:{materialSlot:face.materialSlot})});
      resultFaceIds.push(id);
    }
  }

  if(curvature>0){
    for(const [key,vertex] of createdByKey){
      const [aId,bId,fraction]=key.split('|');
      const [numerator,denominator]=fraction.split('/').map(Number);
      const a=vertexById.get(aId)!,b=vertexById.get(bId)!;
      const chord=Math.hypot(b.position[0]-a.position[0],b.position[1]-a.position[1],b.position[2]-a.position[2]);
      const t=numerator/denominator;
      const bulge=0.5*chord*curvature*Math.sin(Math.PI*t);
      vertex.position=add(vertex.position,scale(normalize(normalSums.get(key)!),bulge));
    }
  }

  const createdVertices=[...createdByKey.values()];
  const result:MioMeshData={vertices:[...mesh.vertices.map(v=>structuredClone(v)),...createdVertices],faces:[...mesh.faces.filter(face=>!selected.has(face.id)).map(face=>structuredClone(face)),...replacementFaces]};
  const resultValidation=validateMeshTopology(result);
  if(!resultValidation.valid)throw new Error(`Segmented bevel produced invalid topology: ${resultValidation.errors.join(' ')}`);
  const diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Segmented bevel produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Segmented bevel produced inconsistent winding.');
  return{mesh:result,bevelFaceIds:resultFaceIds,createdVertexIds:createdVertices.map(v=>v.id),segments,profile,curvature};
};
