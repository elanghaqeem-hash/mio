import type { MioMeshData } from '../../../types/creative';
import { canonicalMeshEdgeId, deriveMeshEdges } from './MeshTopology';
import { rewriteCoordinatedJunctionFaces, type MeshCoordinatedFaceRewriteResult } from './MeshCoordinatedFaceRewrite';

export interface MeshCoordinatedBevelStripCorridor {
  spanId:string;
  sourceVertexIds:string[];
  rewrittenVertexIds:string[];
  rewrittenEdgeIds:string[];
  startReplacementVertexId:string;
  endReplacementVertexId:string;
}
export interface MeshCoordinatedBevelStripPlan {
  rewrite:MeshCoordinatedFaceRewriteResult;
  corridors:MeshCoordinatedBevelStripCorridor[];
  widthRatio:number;
}

export const constructCoordinatedBevelStripPlan=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshCoordinatedBevelStripPlan=>{
  const rewrite=rewriteCoordinatedJunctionFaces(mesh,edgeIds,widthRatio);
  const edgeSet=new Set(deriveMeshEdges(rewrite.mesh).map(edge=>edge.id));
  const allocations=rewrite.endpointPlan.allocations;
  const corridors:MeshCoordinatedBevelStripCorridor[]=[];
  for(const span of rewrite.endpointPlan.transaction.spans){
    if(span.endpointKinds[0]!=='junction'||span.endpointKinds[1]!=='junction')continue;
    const start=allocations.find(a=>a.spanId===span.spanId&&a.junctionVertexId===span.startVertexId);
    const end=allocations.find(a=>a.spanId===span.spanId&&a.junctionVertexId===span.endVertexId);
    if(!start||!end)throw new Error(`Span ${span.spanId} is missing coordinated replacement endpoints.`);
    const internal=span.vertexIds.slice(1,-1);
    const rewrittenVertexIds=[start.replacementVertexId,...internal,end.replacementVertexId];
    if(rewrittenVertexIds.length<3)throw new Error(`Span ${span.spanId} has no safe interior corridor; direct junction-to-junction strips remain unsupported.`);
    const rewrittenEdgeIds:string[]=[];
    for(let i=0;i<rewrittenVertexIds.length-1;i++){
      const id=canonicalMeshEdgeId(rewrittenVertexIds[i],rewrittenVertexIds[i+1]);
      if(!edgeSet.has(id))throw new Error(`Span ${span.spanId} corridor is discontinuous at ${id}.`);
      rewrittenEdgeIds.push(id);
    }
    corridors.push({spanId:span.spanId,sourceVertexIds:[...span.vertexIds],rewrittenVertexIds,rewrittenEdgeIds,startReplacementVertexId:start.replacementVertexId,endReplacementVertexId:end.replacementVertexId});
  }
  if(!corridors.length)throw new Error('Coordinated strip planning requires at least one junction-to-junction span.');
  corridors.sort((a,b)=>a.spanId.localeCompare(b.spanId));
  return{rewrite,corridors,widthRatio};
};
