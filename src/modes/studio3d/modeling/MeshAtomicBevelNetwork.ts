import type { MioMeshData } from '../../../types/creative';
import { planBevelNetwork, type MeshBevelNetworkPlan } from './MeshBevelNetworkPlanner';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { bevelOpenEdgePath } from './MeshOpenBevel';
import { bevelClosedEdgeLoop } from './MeshClosedLoopBevel';
import { bevelTriCornerJunction } from './MeshTriCornerMiter';
import { bevelMultiPoleJunction } from './MeshMultiPoleMiter';
import { replaceCoordinatedCorridorEdges } from './MeshCoordinatedCorridorReplacement';

export type MeshAtomicBevelStrategy='open-path'|'closed-loop'|'tri-corner'|'multi-pole'|'coordinated-network';
export interface MeshAtomicBevelNetworkResult {
  mesh:MioMeshData;
  plan:MeshBevelNetworkPlan;
  strategy:MeshAtomicBevelStrategy;
  createdFaceIds:string[];
  widthRatio:number;
}

const assertFinalTopology=(mesh:MioMeshData):void=>{
  const validation=validateMeshTopology(mesh);
  if(!validation.valid)throw new Error(`Atomic bevel produced invalid topology: ${validation.errors.join(' ')}`);
  const d=diagnoseMeshTopology(mesh);
  if(d.nonManifoldEdgeIds.length)throw new Error('Atomic bevel produced non-manifold topology.');
  if(d.inconsistentWindingEdgeIds.length)throw new Error('Atomic bevel produced inconsistent winding.');
  if(d.zeroAreaFaceIds.length)throw new Error('Atomic bevel produced zero-area geometry.');
};

export const executeAtomicBevelNetwork=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshAtomicBevelNetworkResult=>{
  const source=structuredClone(mesh);
  const plan=planBevelNetwork(source,edgeIds);
  if(!plan.executable)throw new Error(plan.reason??'Bevel network plan is not executable.');
  const junctions=plan.nodes.filter(node=>node.kind==='junction');
  const endpoints=plan.nodes.filter(node=>node.kind==='endpoint');

  let result:MeshAtomicBevelNetworkResult;
  if(junctions.length===0&&plan.isolatedClosedLoops.length===1&&plan.spans.length===0){
    const solved=bevelClosedEdgeLoop(source,plan.isolatedClosedLoops[0].edgeIds,widthRatio);
    result={mesh:solved.mesh,plan,strategy:'closed-loop',createdFaceIds:solved.bevelFaceIds,widthRatio};
  }else if(junctions.length===0&&endpoints.length===2&&plan.spans.length===1){
    const solved=bevelOpenEdgePath(source,plan.spans[0].edgeIds,widthRatio);
    result={mesh:solved.mesh,plan,strategy:'open-path',createdFaceIds:solved.bevelFaceIds,widthRatio};
  }else if(junctions.length===1&&plan.spans.every(span=>span.edgeIds.length===1)&&endpoints.length===junctions[0].selectedDegree){
    const selected=plan.selectedEdgeIds;
    if(junctions[0].selectedDegree===3){
      const solved=bevelTriCornerJunction(source,selected,widthRatio);
      result={mesh:solved.mesh,plan,strategy:'tri-corner',createdFaceIds:solved.miterFaceIds,widthRatio};
    }else{
      const solved=bevelMultiPoleJunction(source,selected,widthRatio);
      result={mesh:solved.mesh,plan,strategy:'multi-pole',createdFaceIds:solved.miterFaceIds,widthRatio};
    }
  }else if(junctions.length>=2){
    const coordinated=replaceCoordinatedCorridorEdges(source,plan.selectedEdgeIds,widthRatio);
    result={mesh:coordinated.mesh,plan,strategy:'coordinated-network',createdFaceIds:[...coordinated.plan.rewrite.miterFaceIds,...coordinated.bevelFaceIds,...coordinated.terminationFaceIds],widthRatio};
  }else{
    throw new Error(`Atomic network execution does not yet support ${junctions.length} junction(s) across ${plan.spans.length} span(s); no geometry was committed.`);
  }
  assertFinalTopology(result.mesh);
  return result;
};
