import type { MioMeshData } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export type MeshBevelSelectionKind='open-path'|'closed-loop'|'junction-network';
export type MeshBevelMiterKind='none'|'two-way'|'tri-corner'|'multi-pole';

export interface MeshBevelJunction {
  vertexId:string;
  selectedDegree:number;
  incidentSelectedEdgeIds:string[];
  miterKind:MeshBevelMiterKind;
}
export interface MeshBevelSelectionTopology {
  kind:MeshBevelSelectionKind;
  selectedEdgeIds:string[];
  selectedVertexIds:string[];
  endpoints:string[];
  junctions:MeshBevelJunction[];
  connected:boolean;
  supported:boolean;
  reason?:string;
}

export const analyzeBevelSelectionTopology=(mesh:MioMeshData,edgeIds:string[]):MeshBevelSelectionTopology=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  const selectedEdgeIds=[...new Set(edgeIds)];
  if(!selectedEdgeIds.length)throw new Error('Bevel topology analysis requires selected edges.');
  const edgeById=new Map(deriveMeshEdges(mesh).map(edge=>[edge.id,edge]));
  const adjacency=new Map<string,Set<string>>();
  const incident=new Map<string,string[]>();
  for(const edgeId of selectedEdgeIds){
    const edge=edgeById.get(edgeId);
    if(!edge)throw new Error(`Bevel selection contains missing edge ${edgeId}.`);
    if(edge.faceIds.length!==2)throw new Error(`Bevel junction analysis requires manifold selected edges; ${edgeId} has ${edge.faceIds.length} incident face(s).`);
    const [a,b]=edge.vertexIds;
    if(!adjacency.has(a))adjacency.set(a,new Set());
    if(!adjacency.has(b))adjacency.set(b,new Set());
    adjacency.get(a)!.add(b);adjacency.get(b)!.add(a);
    incident.set(a,[...(incident.get(a)??[]),edgeId]);
    incident.set(b,[...(incident.get(b)??[]),edgeId]);
  }
  const selectedVertexIds=[...adjacency.keys()].sort((a,b)=>a.localeCompare(b));
  const visited=new Set<string>(),queue=[selectedVertexIds[0]];
  while(queue.length){const id=queue.shift()!;if(visited.has(id))continue;visited.add(id);for(const n of adjacency.get(id)??[])if(!visited.has(n))queue.push(n)}
  const connected=visited.size===selectedVertexIds.length;
  const endpoints=selectedVertexIds.filter(id=>adjacency.get(id)!.size===1);
  const junctions=selectedVertexIds.filter(id=>adjacency.get(id)!.size>2).map(vertexId=>{
    const degree=adjacency.get(vertexId)!.size;
    return{vertexId,selectedDegree:degree,incidentSelectedEdgeIds:[...(incident.get(vertexId)??[])].sort((a,b)=>a.localeCompare(b)),miterKind:degree===3?'tri-corner':'multi-pole'} satisfies MeshBevelJunction;
  });
  const allDegreeTwo=selectedVertexIds.every(id=>adjacency.get(id)!.size===2);
  const pathDegrees=selectedVertexIds.every(id=>adjacency.get(id)!.size<=2)&&endpoints.length===2;
  const kind:MeshBevelSelectionKind=junctions.length?'junction-network':allDegreeTwo?'closed-loop':'open-path';
  let supported=connected&&(allDegreeTwo||pathDegrees);
  let reason:string|undefined;
  if(!connected)reason='Bevel selection must be one connected network.';
  else if(junctions.length){supported=false;reason=`Selection contains ${junctions.length} bevel junction(s); miter topology is required before bevel execution.`;}
  else if(!allDegreeTwo&&!pathDegrees){supported=false;reason='Selection is neither one open path nor one closed loop.';}
  return{kind,selectedEdgeIds,selectedVertexIds,endpoints,junctions,connected,supported,...(reason?{reason}:{})};
};
