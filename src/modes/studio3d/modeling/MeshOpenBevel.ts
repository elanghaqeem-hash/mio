import type { MioMeshData } from '../../../types/creative';
import { deriveMeshEdges } from './MeshTopology';
import { resolveMeshEdgeRailSelection } from './MeshEdgeRail';
import { bevelBoundaryOpenEdgePath, type MeshBoundaryOpenBevelResult } from './MeshBoundaryOpenBevel';
import { bevelInteriorOpenEdgePath, type MeshInteriorOpenBevelResult } from './MeshInteriorOpenBevel';
import { analyzeBevelSelectionTopology } from './MeshBevelJunction';

export type MeshOpenBevelResult =
  | ({ endpointKind:'boundary' } & MeshBoundaryOpenBevelResult)
  | ({ endpointKind:'interior' } & MeshInteriorOpenBevelResult);

export const bevelOpenEdgePath=(mesh:MioMeshData,edgeIds:string[],widthRatio:number):MeshOpenBevelResult=>{
  const topology=analyzeBevelSelectionTopology(mesh,edgeIds);
  if(!topology.supported)throw new Error(topology.reason??'Unsupported bevel selection topology.');
  if(topology.kind!=='open-path')throw new Error('Open Bevel requires one open edge path.');
  const rail=resolveMeshEdgeRailSelection(mesh,edgeIds,false);
  if(rail.closed)throw new Error('Open Bevel requires an open edge path; use Bevel Loop for closed selections.');
  const endpoints=[...rail.selectedAdjacency.entries()].filter(([,neighbors])=>neighbors.size===1).map(([id])=>id);
  if(endpoints.length!==2)throw new Error(`Open Bevel requires exactly two endpoints; found ${endpoints.length}.`);
  const edges=deriveMeshEdges(mesh);
  const endpointBoundary=endpoints.map(endpointId=>edges.some(edge=>edge.vertexIds.includes(endpointId)&&edge.faceIds.length===1));
  if(endpointBoundary.every(Boolean))return{endpointKind:'boundary',...bevelBoundaryOpenEdgePath(mesh,edgeIds,widthRatio)};
  if(endpointBoundary.every(value=>!value))return{endpointKind:'interior',...bevelInteriorOpenEdgePath(mesh,edgeIds,widthRatio)};
  throw new Error('Open Bevel does not support a mixed boundary/interior endpoint path.');
};
