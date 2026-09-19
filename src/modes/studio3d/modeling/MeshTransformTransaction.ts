import type { MioMeshData, MioMeshSelection } from '../../../types/creative';
import { meshSelectionVertexIds, translateMeshSelection } from './MeshOperations';

export interface MeshTransformTransaction {
  readonly original: MioMeshData;
  readonly selection: MioMeshSelection;
  preview(delta:[number,number,number]): MioMeshData;
  commit(delta:[number,number,number]): MioMeshData;
  cancel(): MioMeshData;
}

export const createMeshTransformTransaction = (mesh:MioMeshData, selection:MioMeshSelection):MeshTransformTransaction => {
  const original=structuredClone(mesh);
  const stableSelection=structuredClone(selection);
  return {
    original,
    selection:stableSelection,
    preview:(delta)=>translateMeshSelection(original,stableSelection,delta),
    commit:(delta)=>translateMeshSelection(original,stableSelection,delta),
    cancel:()=>structuredClone(original),
  };
};

export const meshSelectionPivot = (mesh:MioMeshData, selection:MioMeshSelection):[number,number,number]|null => {
  const ids=meshSelectionVertexIds(mesh,selection);
  if(!ids.length)return null;
  const selected=new Set(ids);
  const vertices=mesh.vertices.filter(vertex=>selected.has(vertex.id));
  const sum=vertices.reduce((acc,vertex)=>[acc[0]+vertex.position[0],acc[1]+vertex.position[1],acc[2]+vertex.position[2]] as [number,number,number],[0,0,0]);
  return [sum[0]/vertices.length,sum[1]/vertices.length,sum[2]/vertices.length];
};
