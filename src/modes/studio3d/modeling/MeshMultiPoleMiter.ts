import type { MioMeshData, MioMeshFace, MioMeshVertex } from '../../../types/creative';
import { analyzeBevelSelectionTopology } from './MeshBevelJunction';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';

type Vec3=[number,number,number];
export interface MeshMultiPoleMiterResult {
  mesh:MioMeshData;
  junctionVertexId:string;
  poleDegree:number;
  createdVertexIds:string[];
  miterFaceIds:string[];
  removedVertexIds:string[];
  widthRatio:number;
}
const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const unique=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i++;return `${base}_${i}`};
const edgeInFace=(face:MioMeshFace,a:string,b:string):boolean=>face.vertexIds.some((v,i)=>(v===a&&face.vertexIds[(i+1)%face.vertexIds.length]===b)||(v===b&&face.vertexIds[(i+1)%face.vertexIds.length]===a));

export const bevelMultiPoleJunction=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshMultiPoleMiterResult=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  if(!Number.isFinite(widthRatio)||widthRatio<=0||widthRatio>=0.5)throw new Error('Multi-pole width ratio must be greater than 0 and less than 0.5.');
  const analysis=analyzeBevelSelectionTopology(mesh,edgeIds);
  if(!analysis.connected||analysis.kind!=='junction-network'||analysis.junctions.length!==1)throw new Error('Multi-Pole Miter requires one connected selection with exactly one junction.');
  const junction=analysis.junctions[0];
  if(junction.selectedDegree<4||junction.miterKind!=='multi-pole')throw new Error('Multi-Pole Miter requires a selected junction degree of at least 4.');
  if(analysis.selectedEdgeIds.length!==junction.selectedDegree||analysis.endpoints.length!==junction.selectedDegree)throw new Error('V4.1 supports one star junction whose selected edges all terminate directly at endpoints.');

  const allEdges=deriveMeshEdges(mesh),edgeById=new Map(allEdges.map(e=>[e.id,e]));
  const vertexById=new Map(mesh.vertices.map(v=>[v.id,v]));
  const center=vertexById.get(junction.vertexId);
  if(!center)throw new Error('Multi-pole junction vertex is missing.');
  const incidentEdges=allEdges.filter(edge=>edge.vertexIds.includes(junction.vertexId));
  if(incidentEdges.length!==junction.selectedDegree)throw new Error(`V4.1 requires all source edges at the pole selected; source valence is ${incidentEdges.length}, selected degree is ${junction.selectedDegree}.`);
  const incidentFaces=mesh.faces.filter(face=>face.vertexIds.includes(junction.vertexId));
  if(incidentFaces.length!==junction.selectedDegree)throw new Error(`V4.1 requires a closed simple face fan with one face per pole edge; found ${incidentFaces.length} faces for degree ${junction.selectedDegree}.`);

  const neighborByEdge=new Map<string,string>();
  for(const edgeId of junction.incidentSelectedEdgeIds){
    const edge=edgeById.get(edgeId);
    if(!edge||edge.faceIds.length!==2)throw new Error(`Multi-pole selected edge ${edgeId} must be manifold.`);
    const neighbor=edge.vertexIds.find(id=>id!==junction.vertexId);
    if(!neighbor)throw new Error(`Could not resolve neighbor for ${edgeId}.`);
    neighborByEdge.set(edgeId,neighbor);
  }
  for(const face of incidentFaces){
    const touching=junction.incidentSelectedEdgeIds.filter(edgeId=>edgeInFace(face,junction.vertexId,neighborByEdge.get(edgeId)!));
    if(touching.length!==2)throw new Error(`Multi-pole face ${face.id} must connect exactly two adjacent selected pole edges.`);
  }
  if(new Set(incidentFaces.map(face=>face.materialSlot??0)).size!==1)throw new Error('Multi-Pole Miter does not cross a material boundary.');

  const usedVertexIds=new Set(mesh.vertices.map(v=>v.id)),usedFaceIds=new Set(mesh.faces.map(f=>f.id));
  const cutVertexByEdge=new Map<string,string>(),created:MioMeshVertex[]=[];
  for(const edgeId of junction.incidentSelectedEdgeIds){
    const neighborId=neighborByEdge.get(edgeId)!,neighbor=vertexById.get(neighborId)!;
    const id=unique(`${junction.vertexId}_pole_${neighborId}`,usedVertexIds);usedVertexIds.add(id);
    cutVertexByEdge.set(edgeId,id);created.push({id,position:mix(center.position,neighbor.position,widthRatio)});
  }

  const replacementFaces:MioMeshFace[]=mesh.faces.map(face=>{
    if(!face.vertexIds.includes(junction.vertexId))return structuredClone(face);
    const index=face.vertexIds.indexOf(junction.vertexId);
    const previous=face.vertexIds[(index-1+face.vertexIds.length)%face.vertexIds.length];
    const next=face.vertexIds[(index+1)%face.vertexIds.length];
    const prevCut=cutVertexByEdge.get(canonicalMeshEdgeId(junction.vertexId,previous));
    const nextCut=cutVertexByEdge.get(canonicalMeshEdgeId(junction.vertexId,next));
    if(!prevCut||!nextCut)throw new Error(`Multi-pole face ${face.id} could not resolve both adjacent cut vertices.`);
    const ids:string[]=[];for(const id of face.vertexIds){if(id===junction.vertexId)ids.push(prevCut,nextCut);else ids.push(id);}
    return{...structuredClone(face),vertexIds:ids};
  });

  const cutIds=new Set(cutVertexByEdge.values());
  const temporary:MioMeshData={vertices:[...mesh.vertices.filter(v=>v.id!==junction.vertexId).map(v=>structuredClone(v)),...created],faces:replacementFaces};
  const capBoundaryEdges=deriveMeshEdges(temporary).filter(edge=>edge.faceIds.length===1&&edge.vertexIds.every(id=>cutIds.has(id)));
  if(capBoundaryEdges.length!==junction.selectedDegree)throw new Error(`Multi-pole expected ${junction.selectedDegree} cap boundary edges; found ${capBoundaryEdges.length}.`);
  const adjacency=new Map<string,string[]>();
  for(const edge of capBoundaryEdges){const[a,b]=edge.vertexIds;adjacency.set(a,[...(adjacency.get(a)??[]),b]);adjacency.set(b,[...(adjacency.get(b)??[]),a]);}
  if(adjacency.size!==junction.selectedDegree||[...adjacency.values()].some(ns=>ns.length!==2))throw new Error('Multi-pole cap boundary is not one simple closed cycle.');
  const first=[...cutIds].sort((a,b)=>a.localeCompare(b))[0],ordered:string[]=[];
  let previous:string|undefined,current=first;
  while(ordered.length<junction.selectedDegree){
    if(ordered.includes(current))throw new Error('Multi-pole cap cycle repeated before closure.');
    ordered.push(current);
    const candidates=(adjacency.get(current)??[]).filter(id=>id!==previous);
    if(!candidates.length)throw new Error('Multi-pole cap cycle traversal failed.');
    const next=candidates.sort((a,b)=>a.localeCompare(b))[0];previous=current;current=next;
  }
  if(current!==first)throw new Error('Multi-pole cap boundary did not close.');

  const miterId=unique(`${junction.vertexId}_multi_pole_miter`,usedFaceIds);
  const slot=incidentFaces[0].materialSlot;
  const miter:MioMeshFace={id:miterId,vertexIds:ordered,...(slot===undefined?{}:{materialSlot:slot})};
  let result:MioMeshData={vertices:temporary.vertices,faces:[...replacementFaces,miter]};
  let diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.inconsistentWindingEdgeIds.length){
    result={...result,faces:result.faces.map(face=>face.id===miterId?{...face,vertexIds:[...face.vertexIds].reverse()}:face)};
    diagnostics=diagnoseMeshTopology(result);
  }
  const final=validateMeshTopology(result);
  if(!final.valid)throw new Error(`Multi-pole miter produced invalid topology: ${final.errors.join(' ')}`);
  if(diagnostics.boundaryEdgeIds.length)throw new Error('Multi-pole miter produced an open boundary.');
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Multi-pole miter produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Multi-pole miter produced inconsistent winding.');
  if(diagnostics.zeroAreaFaceIds.length)throw new Error('Multi-pole miter produced zero-area geometry.');
  return{mesh:result,junctionVertexId:junction.vertexId,poleDegree:junction.selectedDegree,createdVertexIds:created.map(v=>v.id),miterFaceIds:[miterId],removedVertexIds:[junction.vertexId],widthRatio};
};
