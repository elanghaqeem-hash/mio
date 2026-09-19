export type GizmoAxis='x'|'y'|'z'|'xy'|'xz'|'yz'|'xyz';
export type GizmoMode='translate'|'rotate'|'scale';
export interface GizmoState { mode:GizmoMode; axis:GizmoAxis; snapping:boolean; snapStep:number; numericValue:number|null; dragging:boolean; }
export const createGizmoState=(mode:GizmoMode='translate'):GizmoState=>({mode,axis:'xyz',snapping:false,snapStep:0.1,numericValue:null,dragging:false});
export const constrainDelta=(delta:[number,number,number],axis:GizmoAxis):[number,number,number]=>{
 const d=[...delta] as [number,number,number];
 if(axis==='x')return[d[0],0,0];if(axis==='y')return[0,d[1],0];if(axis==='z')return[0,0,d[2]];
 if(axis==='xy')return[d[0],d[1],0];if(axis==='xz')return[d[0],0,d[2]];if(axis==='yz')return[0,d[1],d[2]];return d;
};
export const snapDelta=(delta:[number,number,number],step:number):[number,number,number]=>{
 if(!Number.isFinite(step)||step<=0)return delta;
 return delta.map(v=>Math.round(v/step)*step) as [number,number,number];
};
export const beginGizmoDrag=(state:GizmoState,axis:GizmoAxis):GizmoState=>({...state,axis,dragging:true,numericValue:null});
export const endGizmoDrag=(state:GizmoState):GizmoState=>({...state,dragging:false});
