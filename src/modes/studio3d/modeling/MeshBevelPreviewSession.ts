import type { MioMeshData } from '../../../types/creative';
import { resolveMeshEdgeRailSelection } from './MeshEdgeRail';
import { bevelClosedEdgeLoop } from './MeshClosedLoopBevel';
import { bevelOpenEdgePath } from './MeshOpenBevel';
import { segmentBevelFaces } from './MeshBevelSegments';

export interface MeshBevelPreviewParameters { widthRatio:number; segments:number; profile:number }
export interface MeshBevelPreviewResult { mesh:MioMeshData; bevelFaceIds:string[]; pathKind:'closed'|'boundary-open'|'interior-open'; parameters:MeshBevelPreviewParameters }

export class MeshBevelPreviewSession {
  readonly original:MioMeshData;
  readonly edgeIds:string[];
  constructor(mesh:MioMeshData,edgeIds:string[]){
    this.original=structuredClone(mesh);
    this.edgeIds=[...new Set(edgeIds)];
    if(!this.edgeIds.length)throw new Error('Bevel preview requires selected edges.');
  }
  preview(parameters:MeshBevelPreviewParameters):MeshBevelPreviewResult{
    const rail=resolveMeshEdgeRailSelection(this.original,this.edgeIds,false);
    if(rail.closed){
      const base=bevelClosedEdgeLoop(this.original,this.edgeIds,parameters.widthRatio);
      const refined=segmentBevelFaces(base.mesh,base.bevelFaceIds,parameters.segments,parameters.profile);
      return{mesh:refined.mesh,bevelFaceIds:refined.bevelFaceIds,pathKind:'closed',parameters:{...parameters}};
    }
    const base=bevelOpenEdgePath(this.original,this.edgeIds,parameters.widthRatio);
    const refined=segmentBevelFaces(base.mesh,base.bevelFaceIds,parameters.segments,parameters.profile);
    return{mesh:refined.mesh,bevelFaceIds:refined.bevelFaceIds,pathKind:`${base.endpointKind}-open` as 'boundary-open'|'interior-open',parameters:{...parameters}};
  }
  cancel():MioMeshData{return structuredClone(this.original)}
}
