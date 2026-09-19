import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export interface MeshTopologyDiagnostics {
  valid: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  boundaryEdgeIds: string[];
  nonManifoldEdgeIds: string[];
  isolatedVertexIds: string[];
  zeroAreaFaceIds: string[];
  inconsistentWindingEdgeIds: string[];
  duplicateFaceGroups: string[][];
  connectedFaceComponents: string[][];
}

const faceAreaMagnitude=(face:MioMeshFace,vertexById:Map<string,MioMeshVertex>):number=>{
  let x=0,y=0,z=0;
  for(let index=0;index<face.vertexIds.length;index+=1){
    const current=vertexById.get(face.vertexIds[index]);
    const next=vertexById.get(face.vertexIds[(index+1)%face.vertexIds.length]);
    if(!current||!next)return 0;
    x+=(current.position[1]-next.position[1])*(current.position[2]+next.position[2]);
    y+=(current.position[2]-next.position[2])*(current.position[0]+next.position[0]);
    z+=(current.position[0]-next.position[0])*(current.position[1]+next.position[1]);
  }
  return Math.hypot(x,y,z)*0.5;
};

const canonicalCycleSignature=(vertexIds:string[]):string=>{
  if(!vertexIds.length)return '';
  const rotations=(ids:string[]):string[]=>ids.map((_,index)=>[...ids.slice(index),...ids.slice(0,index)].join('|'));
  const forward=rotations(vertexIds);
  const reverse=rotations([...vertexIds].reverse());
  return [...forward,...reverse].sort((a,b)=>a.localeCompare(b))[0];
};

const directedEdgeSign=(face:MioMeshFace,a:string,b:string):number=>{
  for(let index=0;index<face.vertexIds.length;index+=1){
    const current=face.vertexIds[index];
    const next=face.vertexIds[(index+1)%face.vertexIds.length];
    if(current===a&&next===b)return 1;
    if(current===b&&next===a)return -1;
  }
  return 0;
};

const connectedComponents=(mesh:MioMeshData):string[][]=>{
  const adjacency=new Map(mesh.faces.map(face=>[face.id,new Set<string>()]));
  for(const edge of deriveMeshEdges(mesh)){
    for(const a of edge.faceIds)for(const b of edge.faceIds)if(a!==b)adjacency.get(a)?.add(b);
  }
  const visited=new Set<string>();
  const components:string[][]=[];
  for(const face of mesh.faces){
    if(visited.has(face.id))continue;
    const queue=[face.id];
    const component:string[]=[];
    while(queue.length){
      const id=queue.shift()!;
      if(visited.has(id))continue;
      visited.add(id);
      component.push(id);
      for(const next of adjacency.get(id)??[])if(!visited.has(next))queue.push(next);
    }
    components.push(component.sort((a,b)=>a.localeCompare(b)));
  }
  return components.sort((a,b)=>(a[0]??'').localeCompare(b[0]??''));
};

export const diagnoseMeshTopology=(mesh:MioMeshData):MeshTopologyDiagnostics=>{
  const validation=validateMeshTopology(mesh);
  const vertexById=new Map(mesh.vertices.map(vertex=>[vertex.id,vertex]));
  const referenced=new Set(mesh.faces.flatMap(face=>face.vertexIds));
  const edges=validation.errors.length?[]:deriveMeshEdges(mesh);

  const signatureGroups=new Map<string,string[]>();
  for(const face of mesh.faces){
    const signature=canonicalCycleSignature(face.vertexIds);
    const group=signatureGroups.get(signature)??[];
    group.push(face.id);
    signatureGroups.set(signature,group);
  }

  const inconsistentWindingEdgeIds=edges
    .filter(edge=>edge.faceIds.length===2)
    .filter(edge=>{
      const [a,b]=edge.vertexIds;
      const first=mesh.faces.find(face=>face.id===edge.faceIds[0]);
      const second=mesh.faces.find(face=>face.id===edge.faceIds[1]);
      if(!first||!second)return false;
      const firstSign=directedEdgeSign(first,a,b);
      const secondSign=directedEdgeSign(second,a,b);
      return firstSign!==0&&firstSign===secondSign;
    })
    .map(edge=>edge.id);

  return{
    valid:validation.valid,
    validationErrors:[...validation.errors],
    validationWarnings:[...validation.warnings],
    boundaryEdgeIds:edges.filter(edge=>edge.faceIds.length===1).map(edge=>edge.id),
    nonManifoldEdgeIds:edges.filter(edge=>edge.faceIds.length>2).map(edge=>edge.id),
    isolatedVertexIds:mesh.vertices.filter(vertex=>!referenced.has(vertex.id)).map(vertex=>vertex.id),
    zeroAreaFaceIds:mesh.faces.filter(face=>faceAreaMagnitude(face,vertexById)<=1e-10).map(face=>face.id),
    inconsistentWindingEdgeIds,
    duplicateFaceGroups:[...signatureGroups.values()].filter(group=>group.length>1).map(group=>group.sort((a,b)=>a.localeCompare(b))),
    connectedFaceComponents:connectedComponents(mesh),
  };
};

export interface MeshCleanupResult {
  mesh: MioMeshData;
  removedVertexIds: string[];
  removedFaceIds: string[];
}

export const cleanupMeshTopology=(mesh:MioMeshData):MeshCleanupResult=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Cannot clean invalid mesh topology: ${validation.errors.join(' ')}`);

  const signatureOwner=new Map<string,string>();
  const removedFaceIds:string[]=[];
  const keptFaces:MioMeshFace[]=[];

  for(const face of [...mesh.faces].sort((a,b)=>a.id.localeCompare(b.id))){
    const signature=canonicalCycleSignature(face.vertexIds);
    if(signatureOwner.has(signature)){
      removedFaceIds.push(face.id);
      continue;
    }
    signatureOwner.set(signature,face.id);
    keptFaces.push(structuredClone(face));
  }

  const referenced=new Set(keptFaces.flatMap(face=>face.vertexIds));
  const removedVertexIds=mesh.vertices.filter(vertex=>!referenced.has(vertex.id)).map(vertex=>vertex.id);
  const keptVertices=mesh.vertices.filter(vertex=>referenced.has(vertex.id)).map(vertex=>structuredClone(vertex));
  const result:MioMeshData={vertices:keptVertices,faces:keptFaces};
  const finalValidation=validateMeshTopology(result);
  if(!finalValidation.valid)throw new Error(`Topology cleanup produced invalid mesh: ${finalValidation.errors.join(' ')}`);
  return{mesh:result,removedVertexIds,removedFaceIds};
};

export const meshEdgeId=(a:string,b:string):string=>canonicalMeshEdgeId(a,b);
