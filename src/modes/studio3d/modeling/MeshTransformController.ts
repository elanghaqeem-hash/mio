import type { MioMeshData, MioMeshSelection } from '../../../types/creative';
import { meshSelectionVertexIds, translateMeshSelection } from './MeshOperations';
import { meshSelectionPivot } from './MeshTransformTransaction';
import { rotateMeshSelection, scaleMeshSelection } from './MeshTransformOperations';

export type MeshTransformKind='translate'|'rotate'|'scale';
export type MeshTransformSpace='local'|'world';
export interface MeshTransformState {
  kind:MeshTransformKind;
  space:MeshTransformSpace;
  pivot:[number,number,number];
  axis:'x'|'y'|'z'|'xy'|'xz'|'yz'|'xyz';
  active:boolean;
}
export const createMeshTransformState=(mesh:MioMeshData,selection:MioMeshSelection,kind:MeshTransformKind='translate'):MeshTransformState=>({
 kind,space:'local',pivot:meshSelectionPivot(mesh,selection)??[0,0,0],axis:'xyz',active:meshSelectionVertexIds(mesh,selection).length>0,
});
export const applyMeshTransformDelta=(mesh:MioMeshData,selection:MioMeshSelection,state:MeshTransformState,delta:[number,number,number]):MioMeshData=>{
 if(!state.active)return structuredClone(mesh);
 const d:[number,number,number]=[delta[0],delta[1],delta[2]];
 if(state.axis==='x')d[1]=0,d[2]=0;if(state.axis==='y')d[0]=0,d[2]=0;if(state.axis==='z')d[0]=0,d[1]=0;
 if(state.axis==='xy')d[2]=0;if(state.axis==='xz')d[1]=0;if(state.axis==='yz')d[0]=0;
 if(state.kind==='translate')return translateMeshSelection(mesh,selection,d);
 if(state.kind==='scale')return scaleMeshSelection(mesh,selection,[1+d[0],1+d[1],1+d[2]]);
 return rotateMeshSelection(mesh,selection,d);
};
