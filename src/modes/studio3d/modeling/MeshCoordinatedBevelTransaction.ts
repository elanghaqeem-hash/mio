import type { MioMeshData } from '../../../types/creative';
import { planBevelNetwork, type MeshBevelNetworkPlan, type MeshBevelNetworkSpan } from './MeshBevelNetworkPlanner';

export interface MeshBevelJunctionTransaction {
  vertexId:string;
  selectedDegree:number;
  incidentSpanIds:string[];
  miterKind:'tri-corner'|'multi-pole';
}
export interface MeshBevelSpanTransaction {
  spanId:string;
  edgeIds:string[];
  vertexIds:string[];
  startVertexId:string;
  endVertexId:string;
  endpointKinds:['endpoint'|'junction','endpoint'|'junction'];
}
export interface MeshCoordinatedBevelTransaction {
  plan:MeshBevelNetworkPlan;
  junctions:MeshBevelJunctionTransaction[];
  spans:MeshBevelSpanTransaction[];
  executionOrder:string[];
  conflicts:string[];
  ready:boolean;
}

const spanSort=(a:MeshBevelNetworkSpan,b:MeshBevelNetworkSpan):number=>a.id.localeCompare(b.id);

export const compileCoordinatedBevelTransaction=(mesh:MioMeshData,edgeIds:string[]):MeshCoordinatedBevelTransaction=>{
  const plan=planBevelNetwork(mesh,edgeIds);
  if(!plan.executable)throw new Error(plan.reason??'Bevel network plan is not executable.');
  const nodeByVertex=new Map(plan.nodes.map(node=>[node.vertexId,node]));
  const junctions=plan.nodes.filter(node=>node.kind==='junction').map(node=>({
    vertexId:node.vertexId,
    selectedDegree:node.selectedDegree,
    incidentSpanIds:[...node.incidentSpanIds],
    miterKind:(node.selectedDegree===3?'tri-corner':'multi-pole') as 'tri-corner'|'multi-pole',
  }));
  const spans=plan.spans.slice().sort(spanSort).map(span=>{
    const start=nodeByVertex.get(span.startVertexId),end=nodeByVertex.get(span.endVertexId);
    if(!start||!end)throw new Error(`Span ${span.id} does not terminate at explicit network nodes.`);
    return{
      spanId:span.id,
      edgeIds:[...span.edgeIds],
      vertexIds:[...span.vertexIds],
      startVertexId:span.startVertexId,
      endVertexId:span.endVertexId,
      endpointKinds:[start.kind,end.kind] as ['endpoint'|'junction','endpoint'|'junction'],
    };
  });
  const conflicts:string[]=[];
  for(const junction of junctions){
    const incident=spans.filter(span=>span.startVertexId===junction.vertexId||span.endVertexId===junction.vertexId);
    if(incident.length!==junction.selectedDegree)conflicts.push(`junction:${junction.vertexId}:degree-span-mismatch`);
  }
  for(const span of spans){
    if(span.endpointKinds[0]==='junction'&&span.endpointKinds[1]==='junction'&&span.edgeIds.length===1){
      conflicts.push(`span:${span.spanId}:shared-edge-between-junctions`);
    }
  }
  const edgeOwner=new Map<string,string>();
  for(const span of spans)for(const edgeId of span.edgeIds){
    const prior=edgeOwner.get(edgeId);
    if(prior&&prior!==span.spanId)conflicts.push(`edge:${edgeId}:multiple-span-owners`);
    edgeOwner.set(edgeId,span.spanId);
  }
  const executionOrder=[
    ...spans.map(span=>`span:${span.spanId}`),
    ...junctions.slice().sort((a,b)=>a.vertexId.localeCompare(b.vertexId)).map(node=>`junction:${node.vertexId}`),
    'validate:whole-mesh',
    'commit:once',
  ];
  return{plan,junctions,spans,executionOrder,conflicts:[...new Set(conflicts)].sort(),ready:conflicts.length===0};
};
