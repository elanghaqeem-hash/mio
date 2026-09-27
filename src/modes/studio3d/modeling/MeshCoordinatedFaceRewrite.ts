import type { MioMeshData, MioMeshFace } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { allocateCoordinatedSpanEndpoints, type MeshBevelEndpointGeometryPlan } from './MeshCoordinatedSpanEndpoints';

export interface MeshCoordinatedFaceRewriteResult {
  mesh:MioMeshData;
  endpointPlan:MeshBevelEndpointGeometryPlan;
  miterFaceIds:string[];
  removedJunctionVertexIds:string[];
  widthRatio:number;
}
const unique=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i++;return `${base}_${i}`};

export const rewriteCoordinatedJunctionFaces=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshCoordinatedFaceRewriteResult=>{
  const plan=allocateCoordinatedSpanEndpoints(mesh,edgeIds,widthRatio);
  if(plan.transaction.junctions.length<2)throw new Error('Coordinated face rewrite requires at least two junctions.');
  const usedFaceIds=new Set(mesh.faces.map(f=>f.id));
  const junctionIds=new Set(plan.transaction.junctions.map(j=>j.vertexId));
  const allocationFor=(junctionId:string,neighborId:string):string|undefined=>
    plan.allocationByJunctionEdge[`${junctionId}|${canonicalMeshEdgeId(junctionId,neighborId)}`];

  const rewrittenFaces:MioMeshFace[]=mesh.faces.map(face=>{
    const junctionsInFace=face.vertexIds.filter(id=>junctionIds.has(id));
    if(junctionsInFace.length>1)throw new Error(`Face ${face.id} contains multiple selected junctions; coordinated V4.6 requires junctions separated by at least one span vertex.`);
    if(junctionsInFace.length===0)return structuredClone(face);
    const junctionId=junctionsInFace[0],index=face.vertexIds.indexOf(junctionId);
    const previous=face.vertexIds[(index-1+face.vertexIds.length)%face.vertexIds.length];
    const next=face.vertexIds[(index+1)%face.vertexIds.length];
    const previousCut=allocationFor(junctionId,previous),nextCut=allocationFor(junctionId,next);
    if(!previousCut&&!nextCut)throw new Error(`Face ${face.id} has no selected incident span edge at junction ${junctionId}.`);
    const ids:string[]=[];
    for(const id of face.vertexIds){
      if(id!==junctionId){ids.push(id);continue;}
      if(previousCut)ids.push(previousCut);
      if(nextCut)ids.push(nextCut);
    }
    return{...structuredClone(face),vertexIds:ids};
  });

  const vertices=[
    ...mesh.vertices.filter(v=>!junctionIds.has(v.id)).map(v=>structuredClone(v)),
    ...plan.vertices.map(v=>structuredClone(v)),
  ];
  const base:MioMeshData={vertices,faces:rewrittenFaces};
  const miterFaces:MioMeshFace[]=[];
  for(const junction of plan.transaction.junctions.slice().sort((a,b)=>a.vertexId.localeCompare(b.vertexId))){
    const cutIds=new Set(plan.allocations.filter(a=>a.junctionVertexId===junction.vertexId).map(a=>a.replacementVertexId));
    const boundary=deriveMeshEdges(base).filter(e=>e.faceIds.length===1&&e.vertexIds.every(id=>cutIds.has(id)));
    if(boundary.length!==junction.selectedDegree)throw new Error(`Junction ${junction.vertexId} expected ${junction.selectedDegree} cap edges; found ${boundary.length}.`);
    const adjacency=new Map<string,string[]>();
    for(const edge of boundary){const[a,b]=edge.vertexIds;adjacency.set(a,[...(adjacency.get(a)??[]),b]);adjacency.set(b,[...(adjacency.get(b)??[]),a]);}
    if(adjacency.size!==junction.selectedDegree||[...adjacency.values()].some(ns=>ns.length!==2))throw new Error(`Junction ${junction.vertexId} cap is not one simple cycle.`);
    const first=[...cutIds].sort((a,b)=>a.localeCompare(b))[0],ordered:string[]=[];let previous:string|undefined,current=first;
    while(ordered.length<junction.selectedDegree){
      if(ordered.includes(current))throw new Error(`Junction ${junction.vertexId} cap repeated before closure.`);
      ordered.push(current);
      const next=(adjacency.get(current)??[]).filter(id=>id!==previous).sort((a,b)=>a.localeCompare(b))[0];
      if(!next)throw new Error(`Junction ${junction.vertexId} cap traversal failed.`);
      previous=current;current=next;
    }
    if(current!==first)throw new Error(`Junction ${junction.vertexId} cap did not close.`);
    const incident=mesh.faces.filter(f=>f.vertexIds.includes(junction.vertexId));
    if(new Set(incident.map(f=>f.materialSlot??0)).size!==1)throw new Error(`Junction ${junction.vertexId} crosses a material boundary.`);
    const id=unique(`${junction.vertexId}_network_miter`,usedFaceIds);usedFaceIds.add(id);
    const slot=incident[0]?.materialSlot;
    miterFaces.push({id,vertexIds:ordered,...(slot===undefined?{}:{materialSlot:slot})});
  }

  let result:MioMeshData={vertices,faces:[...rewrittenFaces,...miterFaces]};
  let diagnostics=diagnoseMeshTopology(result);
  if(diagnostics.inconsistentWindingEdgeIds.length){
    const miterIds=new Set(miterFaces.map(f=>f.id));
    result={...result,faces:result.faces.map(face=>miterIds.has(face.id)?{...face,vertexIds:[...face.vertexIds].reverse()}:face)};
    diagnostics=diagnoseMeshTopology(result);
  }
  const validation=validateMeshTopology(result);
  if(!validation.valid)throw new Error(`Coordinated face rewrite produced invalid topology: ${validation.errors.join(' ')}`);
  if(diagnostics.boundaryEdgeIds.length)throw new Error(`Coordinated face rewrite produced ${diagnostics.boundaryEdgeIds.length} open boundary edge(s).`);
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Coordinated face rewrite produced non-manifold topology.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Coordinated face rewrite produced inconsistent winding.');
  if(diagnostics.zeroAreaFaceIds.length)throw new Error('Coordinated face rewrite produced zero-area geometry.');
  return{mesh:result,endpointPlan:plan,miterFaceIds:miterFaces.map(f=>f.id),removedJunctionVertexIds:[...junctionIds].sort(),widthRatio};
};
