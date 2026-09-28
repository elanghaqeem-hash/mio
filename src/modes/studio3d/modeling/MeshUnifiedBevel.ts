import type { MioMeshData } from '../../../types/creative';
import { executeAtomicBevelNetwork, type MeshAtomicBevelStrategy } from './MeshAtomicBevelNetwork';
import { segmentBevelFaces } from './MeshBevelSegments';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
export interface MeshUnifiedBevelParameters{widthRatio:number;segments:number;profile:number;curvature:number}
export interface MeshUnifiedBevelResult{mesh:MioMeshData;strategy:MeshAtomicBevelStrategy;bevelFaceIds:string[];parameters:MeshUnifiedBevelParameters}
export const executeUnifiedBevel=(mesh:MioMeshData,edgeIds:string[],parameters:MeshUnifiedBevelParameters):MeshUnifiedBevelResult=>{
 if(!Number.isFinite(parameters.widthRatio)||parameters.widthRatio<=0||parameters.widthRatio>=0.5)throw new Error('Unified bevel width ratio must be greater than 0 and less than 0.5.');
 if(!Number.isInteger(parameters.segments)||parameters.segments<1||parameters.segments>16)throw new Error('Unified bevel segments must be an integer from 1 to 16.');
 if(!Number.isFinite(parameters.profile)||parameters.profile<=0||parameters.profile>=1)throw new Error('Unified bevel profile must be greater than 0 and less than 1.');
 if(!Number.isFinite(parameters.curvature)||parameters.curvature<0||parameters.curvature>1)throw new Error('Unified bevel curvature must be within 0..1.');
 const source=structuredClone(mesh);
 const base=executeAtomicBevelNetwork(source,edgeIds,parameters.widthRatio);
 const quads=base.createdFaceIds.filter(id=>base.mesh.faces.find(f=>f.id===id)?.vertexIds.length===4);
 let result=structuredClone(base.mesh),faceIds=[...base.createdFaceIds];
 if(parameters.segments>1&&quads.length){
   const refined=segmentBevelFaces(base.mesh,quads,parameters.segments,parameters.profile,parameters.curvature);
   result=refined.mesh;const replaced=new Set(quads);faceIds=[...base.createdFaceIds.filter(id=>!replaced.has(id)),...refined.bevelFaceIds];
 }
 const d=diagnoseMeshTopology(result);if(d.nonManifoldEdgeIds.length||d.inconsistentWindingEdgeIds.length||d.zeroAreaFaceIds.length)throw new Error('Unified bevel final topology validation failed; no geometry was committed.');
 return{mesh:result,strategy:base.strategy,bevelFaceIds:faceIds,parameters:{...parameters}};
};
export class MeshUnifiedBevelPreviewSession{
 readonly original:MioMeshData;readonly edgeIds:string[];
 constructor(mesh:MioMeshData,edgeIds:string[]){this.original=structuredClone(mesh);this.edgeIds=[...new Set(edgeIds)];if(!this.edgeIds.length)throw new Error('Unified bevel preview requires selected edges.')}
 preview(parameters:MeshUnifiedBevelParameters):MeshUnifiedBevelResult{return executeUnifiedBevel(this.original,this.edgeIds,parameters)}
 cancel():MioMeshData{return structuredClone(this.original)}
}
