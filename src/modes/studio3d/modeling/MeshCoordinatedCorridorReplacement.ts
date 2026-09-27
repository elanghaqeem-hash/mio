import type { MioMeshData } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { constructCoordinatedBevelStripPlan, type MeshCoordinatedBevelStripPlan } from './MeshCoordinatedBevelStrips';
import { bevelCapTerminatedCorridor } from './MeshCapTerminatedCorridorBevel';

export interface MeshCoordinatedCorridorReplacementResult {
  mesh:MioMeshData;
  plan:MeshCoordinatedBevelStripPlan;
  bevelFaceIds:string[];
  terminationFaceIds:string[];
  createdVertexIds:string[];
  removedVertexIds:string[];
  replacedSpanIds:string[];
  widthRatio:number;
}

export const replaceCoordinatedCorridorEdges=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshCoordinatedCorridorReplacementResult=>{
  const source=structuredClone(mesh);
  const plan=constructCoordinatedBevelStripPlan(source,edgeIds,widthRatio);
  let candidate=structuredClone(plan.rewrite.mesh);
  const bevelFaceIds:string[]=[];
  const terminationFaceIds:string[]=[];
  const createdVertexIds:string[]=[];
  const removedVertexIds:string[]=[];
  const replacedSpanIds:string[]=[];

  for(const corridor of plan.corridors){
    try{
      const result=bevelCapTerminatedCorridor(candidate,corridor.rewrittenEdgeIds,widthRatio);
      candidate=result.mesh;
      bevelFaceIds.push(...result.bevelFaceIds);

      createdVertexIds.push(...result.createdVertexIds);
      removedVertexIds.push(...result.removedVertexIds);
      replacedSpanIds.push(corridor.spanId);
    }catch(reason){
      throw new Error(`Coordinated corridor ${corridor.spanId} replacement failed; no geometry was committed: ${reason instanceof Error?reason.message:String(reason)}`);
    }
  }

  const validation=validateMeshTopology(candidate);
  const diagnostics=diagnoseMeshTopology(candidate);
  if(!validation.valid)throw new Error(`Coordinated corridor replacement produced invalid topology; no geometry was committed: ${validation.errors.join(' ')}`);
  if(diagnostics.boundaryEdgeIds.length)throw new Error(`Coordinated corridor replacement produced ${diagnostics.boundaryEdgeIds.length} boundary edge(s); no geometry was committed.`);
  if(diagnostics.nonManifoldEdgeIds.length)throw new Error('Coordinated corridor replacement produced non-manifold topology; no geometry was committed.');
  if(diagnostics.inconsistentWindingEdgeIds.length)throw new Error('Coordinated corridor replacement produced inconsistent winding; no geometry was committed.');
  if(diagnostics.zeroAreaFaceIds.length)throw new Error('Coordinated corridor replacement produced zero-area geometry; no geometry was committed.');
  if(diagnostics.duplicateFaceGroups.length)throw new Error('Coordinated corridor replacement produced duplicate faces; no geometry was committed.');

  return{mesh:candidate,plan,bevelFaceIds,terminationFaceIds,createdVertexIds,removedVertexIds,replacedSpanIds,widthRatio};
};
