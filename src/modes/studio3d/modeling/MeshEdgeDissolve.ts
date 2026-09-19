import type { MioMeshData, MioMeshFace } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshEdgeDissolveResult {
  mesh: MioMeshData;
  survivorFaceId: string;
  removedFaceId: string;
  removedEdgeId: string;
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const directedEdgeIndex=(face:MioMeshFace,a:string,b:string):number=>{
  for(let index=0;index<face.vertexIds.length;index+=1){
    if(face.vertexIds[index]===a&&face.vertexIds[(index+1)%face.vertexIds.length]===b)return index;
  }
  return -1;
};

const complementPath=(face:MioMeshFace,a:string,b:string):string[]=>{
  const edgeIndex=directedEdgeIndex(face,a,b);
  if(edgeIndex<0)throw new Error(`Face ${face.id} does not contain directed edge ${a}->${b}.`);
  const path:string[]=[];
  for(let step=1;step<face.vertexIds.length;step+=1)path.push(face.vertexIds[(edgeIndex+step)%face.vertexIds.length]);
  return path;
};

export const dissolveMeshEdge=(mesh:MioMeshData,edgeId:string):MeshEdgeDissolveResult=>{
  ensureValid(mesh);
  const edge=deriveMeshEdges(mesh).find(candidate=>candidate.id===edgeId);
  if(!edge)throw new Error(`Mesh edge ${edgeId} does not exist.`);
  if(edge.faceIds.length!==2)throw new Error('Edge dissolve requires an internal manifold edge shared by exactly two faces.');

  const first=mesh.faces.find(face=>face.id===edge.faceIds[0]);
  const second=mesh.faces.find(face=>face.id===edge.faceIds[1]);
  if(!first||!second)throw new Error('Edge dissolve could not resolve both incident faces.');
  if((first.materialSlot??0)!==(second.materialSlot??0))throw new Error('Edge dissolve across different material slots is not supported.');

  const [survivor,removed]=first.id.localeCompare(second.id)<=0?[first,second]:[second,first];
  const [ea,eb]=edge.vertexIds;
  let a=ea,b=eb;
  if(directedEdgeIndex(survivor,a,b)<0){
    if(directedEdgeIndex(survivor,b,a)<0)throw new Error('Survivor face does not contain the selected edge.');
    [a,b]=[b,a];
  }
  if(directedEdgeIndex(removed,b,a)<0)throw new Error('Incident faces must use opposite winding across the dissolved edge.');

  const survivorPath=complementPath(survivor,a,b);
  const removedPath=complementPath(removed,b,a);
  const mergedVertexIds=[...survivorPath,...removedPath.slice(1,-1)];
  if(mergedVertexIds.length<3||new Set(mergedVertexIds).size!==mergedVertexIds.length){
    throw new Error('Edge dissolve would create a degenerate or self-referencing polygon.');
  }

  const result:MioMeshData={
    vertices:mesh.vertices.map(vertex=>structuredClone(vertex)),
    faces:mesh.faces
      .filter(face=>face.id!==removed.id)
      .map(face=>face.id===survivor.id?{...structuredClone(face),vertexIds:mergedVertexIds}:structuredClone(face)),
  };
  ensureValid(result);
  return{
    mesh:result,
    survivorFaceId:survivor.id,
    removedFaceId:removed.id,
    removedEdgeId:edge.id,
  };
};
