import type { MioMeshData, MioMeshVertex } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges, validateMeshTopology } from './MeshTopology';
import { compileCoordinatedBevelTransaction, type MeshCoordinatedBevelTransaction } from './MeshCoordinatedBevelTransaction';

type Vec3=[number,number,number];
export interface MeshBevelEndpointAllocation {
  junctionVertexId:string;
  spanId:string;
  selectedEdgeId:string;
  neighborVertexId:string;
  replacementVertexId:string;
  position:Vec3;
}
export interface MeshBevelEndpointGeometryPlan {
  transaction:MeshCoordinatedBevelTransaction;
  allocations:MeshBevelEndpointAllocation[];
  vertices:MioMeshVertex[];
  allocationByJunctionEdge:Record<string,string>;
  widthRatio:number;
}

const mix=(a:Vec3,b:Vec3,t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const unique=(base:string,used:Set<string>):string=>{if(!used.has(base))return base;let i=2;while(used.has(`${base}_${i}`))i++;return `${base}_${i}`};

export const allocateCoordinatedSpanEndpoints=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshBevelEndpointGeometryPlan=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  if(!Number.isFinite(widthRatio)||widthRatio<=0||widthRatio>=0.5)throw new Error('Coordinated bevel width ratio must be greater than 0 and less than 0.5.');
  const transaction=compileCoordinatedBevelTransaction(mesh,edgeIds);
  if(!transaction.ready)throw new Error(`Coordinated bevel transaction has unresolved conflicts: ${transaction.conflicts.join(', ')}`);
  const vertexById=new Map(mesh.vertices.map(v=>[v.id,v]));
  const edgeById=new Map(deriveMeshEdges(mesh).map(e=>[e.id,e]));
  const used=new Set(mesh.vertices.map(v=>v.id));
  const allocations:MeshBevelEndpointAllocation[]=[];
  const allocationByJunctionEdge:Record<string,string>={};

  for(const junction of transaction.junctions.slice().sort((a,b)=>a.vertexId.localeCompare(b.vertexId))){
    const center=vertexById.get(junction.vertexId);
    if(!center)throw new Error(`Missing junction vertex ${junction.vertexId}.`);
    for(const spanId of junction.incidentSpanIds.slice().sort((a,b)=>a.localeCompare(b))){
      const span=transaction.spans.find(candidate=>candidate.spanId===spanId);
      if(!span)throw new Error(`Missing incident span ${spanId} for junction ${junction.vertexId}.`);
      const fromStart=span.startVertexId===junction.vertexId;
      if(!fromStart&&span.endVertexId!==junction.vertexId)throw new Error(`Span ${spanId} is not incident to junction ${junction.vertexId}.`);
      const neighborVertexId=fromStart?span.vertexIds[1]:span.vertexIds[span.vertexIds.length-2];
      if(!neighborVertexId)throw new Error(`Span ${spanId} has no neighbor away from junction ${junction.vertexId}.`);
      const selectedEdgeId=canonicalMeshEdgeId(junction.vertexId,neighborVertexId);
      if(!edgeById.has(selectedEdgeId))throw new Error(`Selected junction edge ${selectedEdgeId} is missing.`);
      const neighbor=vertexById.get(neighborVertexId);
      if(!neighbor)throw new Error(`Missing span neighbor vertex ${neighborVertexId}.`);
      const key=`${junction.vertexId}|${selectedEdgeId}`;
      if(allocationByJunctionEdge[key])throw new Error(`Duplicate coordinated endpoint allocation for ${key}.`);
      const replacementVertexId=unique(`${junction.vertexId}_network_${neighborVertexId}`,used);used.add(replacementVertexId);
      allocationByJunctionEdge[key]=replacementVertexId;
      allocations.push({junctionVertexId:junction.vertexId,spanId,selectedEdgeId,neighborVertexId,replacementVertexId,position:mix(center.position,neighbor.position,widthRatio)});
    }
  }
  allocations.sort((a,b)=>a.junctionVertexId.localeCompare(b.junctionVertexId)||a.selectedEdgeId.localeCompare(b.selectedEdgeId));
  return{
    transaction,
    allocations,
    vertices:allocations.map(a=>({id:a.replacementVertexId,position:a.position})),
    allocationByJunctionEdge,
    widthRatio,
  };
};
