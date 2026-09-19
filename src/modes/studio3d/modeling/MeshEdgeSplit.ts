import type { MioMeshData, MioMeshVertex } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshEdgeSplitResult {
  mesh: MioMeshData;
  newVertexId: string;
  updatedFaceIds: string[];
  sourceEdgeId: string;
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const uniqueId=(base:string,used:Set<string>):string=>{
  if(!used.has(base))return base;
  let index=2;
  while(used.has(`${base}_${index}`))index+=1;
  return `${base}_${index}`;
};

export const splitMeshEdge=(mesh:MioMeshData,edgeId:string,ratio=0.5):MeshEdgeSplitResult=>{
  ensureValid(mesh);
  if(!Number.isFinite(ratio)||ratio<=0||ratio>=1)throw new Error('Edge split ratio must be greater than 0 and less than 1.');
  const edge=deriveMeshEdges(mesh).find(candidate=>candidate.id===edgeId);
  if(!edge)throw new Error(`Mesh edge ${edgeId} does not exist.`);
  if(edge.faceIds.length>2)throw new Error('Edge split currently requires boundary or manifold topology.');

  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const [aId,bId]=edge.vertexIds;
  const a=vertexById.get(aId);
  const b=vertexById.get(bId);
  if(!a||!b)throw new Error('Edge split could not resolve source vertices.');

  const usedVertexIds=new Set(mesh.vertices.map(vertex=>vertex.id));
  const newVertexId=uniqueId(`${aId}_${bId}_split`,usedVertexIds);
  const newVertex:MioMeshVertex={
    id:newVertexId,
    position:[
      a.position[0]+(b.position[0]-a.position[0])*ratio,
      a.position[1]+(b.position[1]-a.position[1])*ratio,
      a.position[2]+(b.position[2]-a.position[2])*ratio,
    ],
  };

  const incidentSet=new Set(edge.faceIds);
  const updatedFaceIds:string[]=[];
  const faces=mesh.faces.map(face=>{
    if(!incidentSet.has(face.id))return structuredClone(face);
    let inserted=false;
    const vertexIds:string[]=[];
    for(let index=0;index<face.vertexIds.length;index+=1){
      const current=face.vertexIds[index];
      const next=face.vertexIds[(index+1)%face.vertexIds.length];
      vertexIds.push(current);
      if((current===aId&&next===bId)||(current===bId&&next===aId)){
        vertexIds.push(newVertexId);
        inserted=true;
      }
    }
    if(!inserted)throw new Error(`Incident face ${face.id} does not contain source edge ${edgeId}.`);
    updatedFaceIds.push(face.id);
    return{...structuredClone(face),vertexIds};
  });

  const result:MioMeshData={
    vertices:[...mesh.vertices.map(vertex=>structuredClone(vertex)),newVertex],
    faces,
  };
  ensureValid(result);
  return{mesh:result,newVertexId,updatedFaceIds,sourceEdgeId:edgeId};
};
