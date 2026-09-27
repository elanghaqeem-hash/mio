import type { MioMeshData } from '../../../types/creative';
import { deriveMeshEdges, validateMeshTopology } from './MeshTopology';

export type MeshBevelNetworkNodeKind='endpoint'|'junction';
export interface MeshBevelNetworkNode {
  vertexId:string;
  kind:MeshBevelNetworkNodeKind;
  selectedDegree:number;
  incidentSpanIds:string[];
}
export interface MeshBevelNetworkSpan {
  id:string;
  edgeIds:string[];
  vertexIds:string[];
  startVertexId:string;
  endVertexId:string;
  closed:boolean;
}
export interface MeshBevelNetworkPlan {
  selectedEdgeIds:string[];
  connected:boolean;
  nodes:MeshBevelNetworkNode[];
  spans:MeshBevelNetworkSpan[];
  isolatedClosedLoops:MeshBevelNetworkSpan[];
  executable:boolean;
  reason?:string;
}

export const planBevelNetwork=(mesh:MioMeshData,edgeIds:string[]):MeshBevelNetworkPlan=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Invalid mesh topology: ${validation.errors.join(' ')}`);
  const selectedEdgeIds=[...new Set(edgeIds)].sort((a,b)=>a.localeCompare(b));
  if(!selectedEdgeIds.length)throw new Error('Bevel network planning requires selected edges.');
  const edgeById=new Map(deriveMeshEdges(mesh).map(edge=>[edge.id,edge]));
  const adjacency=new Map<string,Map<string,string>>();
  for(const edgeId of selectedEdgeIds){
    const edge=edgeById.get(edgeId);
    if(!edge)throw new Error(`Bevel network contains missing edge ${edgeId}.`);
    if(edge.faceIds.length!==2)throw new Error(`Bevel network requires manifold selected edges; ${edgeId} has ${edge.faceIds.length} incident face(s).`);
    const[a,b]=edge.vertexIds;
    if(!adjacency.has(a))adjacency.set(a,new Map());
    if(!adjacency.has(b))adjacency.set(b,new Map());
    adjacency.get(a)!.set(b,edgeId);adjacency.get(b)!.set(a,edgeId);
  }
  const vertices=[...adjacency.keys()].sort((a,b)=>a.localeCompare(b));
  const visitedVertices=new Set<string>(),queue=[vertices[0]];
  while(queue.length){const v=queue.shift()!;if(visitedVertices.has(v))continue;visitedVertices.add(v);for(const n of adjacency.get(v)!.keys())if(!visitedVertices.has(n))queue.push(n)}
  const connected=visitedVertices.size===vertices.length;
  const nodeVertices=new Set(vertices.filter(v=>adjacency.get(v)!.size!==2));
  const usedEdges=new Set<string>(),spans:MeshBevelNetworkSpan[]=[];
  const walk=(start:string,next:string,firstEdge:string):MeshBevelNetworkSpan=>{
    const edgePath=[firstEdge],vertexPath=[start,next];usedEdges.add(firstEdge);
    let previous=start,current=next;
    while(!nodeVertices.has(current)){
      const candidates=[...adjacency.get(current)!.entries()].filter(([neighbor,edgeId])=>neighbor!==previous&&!usedEdges.has(edgeId));
      if(!candidates.length)break;
      candidates.sort((a,b)=>a[1].localeCompare(b[1]));
      const[nextVertex,nextEdge]=candidates[0];usedEdges.add(nextEdge);edgePath.push(nextEdge);vertexPath.push(nextVertex);previous=current;current=nextVertex;
      if(current===start)break;
    }
    return{id:'',edgeIds:edgePath,vertexIds:vertexPath,startVertexId:start,endVertexId:current,closed:current===start};
  };
  for(const start of [...nodeVertices].sort((a,b)=>a.localeCompare(b))){
    const neighbors=[...adjacency.get(start)!.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
    for(const[next,edgeId] of neighbors)if(!usedEdges.has(edgeId))spans.push(walk(start,next,edgeId));
  }
  const isolatedClosedLoops:MeshBevelNetworkSpan[]=[];
  for(const edgeId of selectedEdgeIds){
    if(usedEdges.has(edgeId))continue;
    const edge=edgeById.get(edgeId)!,start=edge.vertexIds[0],next=edge.vertexIds[1];
    const loop=walk(start,next,edgeId);
    if(!loop.closed)throw new Error('Degree-2 bevel component did not resolve to a closed loop.');
    isolatedClosedLoops.push(loop);
  }
  const allSpans=[...spans,...isolatedClosedLoops];
  allSpans.sort((a,b)=>a.edgeIds.join('|').localeCompare(b.edgeIds.join('|')));
  allSpans.forEach((span,index)=>span.id=`bevel_span_${index+1}`);
  const incidentSpanIds=new Map<string,string[]>();
  for(const span of spans){
    for(const v of new Set([span.startVertexId,span.endVertexId]))incidentSpanIds.set(v,[...(incidentSpanIds.get(v)??[]),span.id]);
  }
  const nodes:MeshBevelNetworkNode[]=[...nodeVertices].sort((a,b)=>a.localeCompare(b)).map(vertexId=>({
    vertexId,
    kind:adjacency.get(vertexId)!.size===1?'endpoint':'junction',
    selectedDegree:adjacency.get(vertexId)!.size,
    incidentSpanIds:[...(incidentSpanIds.get(vertexId)??[])].sort((a,b)=>a.localeCompare(b))
  }));
  let executable=connected,reason:string|undefined;
  if(!connected){executable=false;reason='V4.2 execution planning requires one connected bevel network.';}
  const invalidNode=nodes.find(node=>node.kind==='junction'&&node.selectedDegree<3);
  if(invalidNode){executable=false;reason=`Invalid bevel junction degree at ${invalidNode.vertexId}.`;}
  return{selectedEdgeIds,connected,nodes,spans,isolatedClosedLoops,executable,...(reason?{reason}:{})};
};
