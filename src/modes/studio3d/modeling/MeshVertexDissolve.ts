import type { MioMeshData, MioMeshFace } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshVertexDissolveResult {
  mesh: MioMeshData;
  removedVertexId: string;
  restoredEdgeId: string;
  updatedFaceIds: string[];
}

const ensureValid=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
};

const removeVertexFromFace=(face:MioMeshFace,vertexId:string,neighborA:string,neighborB:string):MioMeshFace=>{
  const index=face.vertexIds.indexOf(vertexId);
  if(index<0)return structuredClone(face);
  const previous=face.vertexIds[(index-1+face.vertexIds.length)%face.vertexIds.length];
  const next=face.vertexIds[(index+1)%face.vertexIds.length];
  if(!((previous===neighborA&&next===neighborB)||(previous===neighborB&&next===neighborA))){
    throw new Error(`Face ${face.id} does not use the dissolved vertex between its two rail neighbors.`);
  }
  const vertexIds=face.vertexIds.filter(id=>id!==vertexId);
  if(vertexIds.length<3||new Set(vertexIds).size<3)throw new Error(`Dissolving vertex ${vertexId} would collapse face ${face.id} below three unique vertices.`);
  return{...structuredClone(face),vertexIds};
};

export const dissolveValence2Vertex=(mesh:MioMeshData,vertexId:string):MeshVertexDissolveResult=>{
  ensureValid(mesh);
  if(!mesh.vertices.some(vertex=>vertex.id===vertexId))throw new Error(`Mesh vertex ${vertexId} does not exist.`);

  const edges=deriveMeshEdges(mesh);
  const incidentEdges=edges.filter(edge=>edge.vertexIds.includes(vertexId));
  if(incidentEdges.length!==2)throw new Error(`Vertex dissolve currently requires valence 2; vertex ${vertexId} has valence ${incidentEdges.length}.`);
  if(incidentEdges.some(edge=>edge.faceIds.length>2))throw new Error('Vertex dissolve does not support non-manifold incident edges.');

  const neighbors=incidentEdges.map(edge=>edge.vertexIds[0]===vertexId?edge.vertexIds[1]:edge.vertexIds[0]);
  if(neighbors[0]===neighbors[1])throw new Error('Vertex dissolve requires two distinct neighboring vertices.');
  const restoredEdgeId=canonicalMeshEdgeId(neighbors[0],neighbors[1]);
  const affectedFaces=mesh.faces.filter(face=>face.vertexIds.includes(vertexId));
  if(!affectedFaces.length)throw new Error('Vertex dissolve cannot remove an isolated topology vertex through this operation.');

  const existingRestoredEdge=edges.find(edge=>edge.id===restoredEdgeId);
  const externalExistingFaces=existingRestoredEdge?.faceIds.filter(faceId=>!affectedFaces.some(face=>face.id===faceId))??[];
  if(externalExistingFaces.length+affectedFaces.length>2){
    throw new Error('Vertex dissolve would create a non-manifold restored edge.');
  }

  const updatedFaceIds:string[]=[];
  const faces=mesh.faces.map(face=>{
    if(!face.vertexIds.includes(vertexId))return structuredClone(face);
    updatedFaceIds.push(face.id);
    return removeVertexFromFace(face,vertexId,neighbors[0],neighbors[1]);
  });
  const result:MioMeshData={
    vertices:mesh.vertices.filter(vertex=>vertex.id!==vertexId).map(vertex=>structuredClone(vertex)),
    faces,
  };
  ensureValid(result);
  const restored=deriveMeshEdges(result).find(edge=>edge.id===restoredEdgeId);
  if(!restored)throw new Error('Vertex dissolve failed to restore the neighboring edge.');
  if(restored.faceIds.length>2)throw new Error('Vertex dissolve produced a non-manifold restored edge.');
  return{mesh:result,removedVertexId:vertexId,restoredEdgeId,updatedFaceIds};
};
