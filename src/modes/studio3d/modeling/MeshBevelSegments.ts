import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';

export interface MeshBevelSegmentResult {
  mesh:MioMeshData;
  bevelFaceIds:string[];
  createdVertexIds:string[];
  segments:number;
  profile:number;
}

const uniqueId=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i+=1;return `${base}_${i}`};
const mix=(a:MioMeshVertex,b:MioMeshVertex,t:number):[number,number,number]=>[a.position[0]+(b.position[0]-a.position[0])*t,a.position[1]+(b.position[1]-a.position[1])*t,a.position[2]+(b.position[2]-a.position[2])*t];
export const bevelProfileParameter=(t:number,profile:number):number=>{
  if(!Number.isFinite(t)||t<0||t>1)throw new Error('Bevel profile parameter t must be within 0..1.');
  if(!Number.isFinite(profile)||profile<=0||profile>=1)throw new Error('Bevel profile must be greater than 0 and less than 1.');
  if(t===0||t===1)return t;
  const exponent=Math.pow(2,(profile-0.5)*4);
  const a=Math.pow(t,exponent),b=Math.pow(1-t,exponent);
  return a/(a+b);
};

export const segmentBevelFaces=(mesh:MioMeshData,bevelFaceIds:string[],segments:number,profile=0.5):MeshBevelSegmentResult=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  if(!Number.isInteger(segments)||segments<1||segments>16)throw new Error('Bevel segments must be an integer from 1 to 16.');
  if(!Number.isFinite(profile)||profile<=0||profile>=1)throw new Error('Bevel profile must be greater than 0 and less than 1.');
  const selected=new Set(bevelFaceIds);
  if(!selected.size)throw new Error('Segment Bevel requires at least one bevel face.');
  const faceById=new Map(mesh.faces.map(face=>[face.id,face]));
  for(const id of selected){const face=faceById.get(id);if(!face)throw new Error(`Bevel face ${id} does not exist.`);if(face.vertexIds.length!==4)throw new Error(`Bevel face ${id} must be a quad.`)}
  if(segments===1)return{mesh:structuredClone(mesh),bevelFaceIds:[...bevelFaceIds],createdVertexIds:[],segments,profile};

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const usedFaceIds=new Set(mesh.faces.map(face=>face.id));
  const createdVertices:MioMeshVertex[]=[];
  const replacementFaces:MioMeshFace[]=[];
  const resultFaceIds:string[]=[];

  for(const faceId of bevelFaceIds){
    const face=faceById.get(faceId)!;
    const [end0,start0,start1,end1]=face.vertexIds;
    const startA=vertexById.get(start0)!,startB=vertexById.get(start1)!;
    const endA=vertexById.get(end0)!,endB=vertexById.get(end1)!;
    const startIds=[start0],endIds=[end0];
    for(let index=1;index<segments;index+=1){
      const t=bevelProfileParameter(index/segments,profile);
      const sid=uniqueId(`${faceId}_segment_${index}_start`,usedVertexIds);usedVertexIds.add(sid);
      const eid=uniqueId(`${faceId}_segment_${index}_end`,usedVertexIds);usedVertexIds.add(eid);
      createdVertices.push({id:sid,position:mix(startA,startB,t)},{id:eid,position:mix(endA,endB,t)});
      startIds.push(sid);endIds.push(eid);
    }
    startIds.push(start1);endIds.push(end1);
    for(let index=0;index<segments;index+=1){
      const id=uniqueId(`${faceId}_segment_face_${index+1}`,usedFaceIds);usedFaceIds.add(id);
      replacementFaces.push({id,vertexIds:[endIds[index],startIds[index],startIds[index+1],endIds[index+1]],...(face.materialSlot===undefined?{}:{materialSlot:face.materialSlot})});
      resultFaceIds.push(id);
    }
  }

  const result:MioMeshData={vertices:[...mesh.vertices.map(v=>structuredClone(v)),...createdVertices],faces:[...mesh.faces.filter(face=>!selected.has(face.id)).map(face=>structuredClone(face)),...replacementFaces]};
  const resultValidation=validateMeshTopology(result);
  if(!resultValidation.valid)throw new Error(`Segmented bevel produced invalid topology: ${resultValidation.errors.join(' ')}`);
  const diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Segmented bevel produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Segmented bevel produced inconsistent winding.');
  return{mesh:result,bevelFaceIds:resultFaceIds,createdVertexIds:createdVertices.map(v=>v.id),segments,profile};
};
