import type { MioMeshData,MioMeshModifier,MioMirrorModifier } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
import { subdivideCatmullClark } from './MeshCatmullClark';
import { solidifyMesh } from './MeshSolidify';

export interface MioModifierEvaluationStep{modifierId:string;type:MioMeshModifier['type'];inputVertexCount:number;outputVertexCount:number;inputFaceCount:number;outputFaceCount:number}
export interface MioModifierEvaluationResult{mesh:MioMeshData;steps:MioModifierEvaluationStep[]}

const mirrorPosition=(p:[number,number,number],axis:'x'|'y'|'z'):[number,number,number]=>{const q:[number,number,number]=[...p];q[axis==='x'?0:axis==='y'?1:2]*=-1;return q};
const applyMirror=(mesh:MioMeshData,m:MioMirrorModifier):MioMeshData=>{
 if(!Number.isFinite(m.mergeDistance)||m.mergeDistance<0)throw new Error('Mirror merge distance must be a non-negative finite number.');
 const source=structuredClone(mesh),axisIndex=m.axis==='x'?0:m.axis==='y'?1:2;
 const used=new Set(source.vertices.map(v=>v.id)),map=new Map<string,string>(),extraVertices=[] as MioMeshData['vertices'];
 const id=(base:string)=>{let x=base,n=2;while(used.has(x))x=`${base}_${n++}`;used.add(x);return x};
 for(const v of source.vertices){
   if(m.merge&&Math.abs(v.position[axisIndex])<=m.mergeDistance){map.set(v.id,v.id);continue}
   const next=id(`${v.id}_mirror_${m.axis}`);map.set(v.id,next);extraVertices.push({id:next,position:mirrorPosition(v.position,m.axis)});
 }
 const faceUsed=new Set(source.faces.map(f=>f.id)),extraFaces:MioMeshData['faces']=[];
 for(const f of source.faces){let fid=`${f.id}_mirror_${m.axis}`,n=2;while(faceUsed.has(fid))fid=`${f.id}_mirror_${m.axis}_${n++}`;faceUsed.add(fid);extraFaces.push({id:fid,vertexIds:[...f.vertexIds].reverse().map(v=>map.get(v)!),...(f.materialSlot===undefined?{}:{materialSlot:f.materialSlot})})}
 const result={vertices:[...source.vertices,...extraVertices],faces:[...source.faces,...extraFaces]};
 const v=validateMeshTopology(result);if(!v.valid)throw new Error(`Mirror modifier produced invalid topology: ${v.errors.join(' ')}`);
 const d=diagnoseMeshTopology(result);if(d.nonManifoldEdgeIds.length||d.inconsistentWindingEdgeIds.length||d.zeroAreaFaceIds.length)throw new Error('Mirror modifier produced unsafe topology.');
 return result;
};
export const evaluateMeshModifierStack=(mesh:MioMeshData,modifiers:MioMeshModifier[]=[]):MioModifierEvaluationResult=>{
 const source=structuredClone(mesh);const initial=validateMeshTopology(source);if(!initial.valid)throw new Error(`Cannot evaluate modifiers on invalid mesh: ${initial.errors.join(' ')}`);
 let current=source;const steps:MioModifierEvaluationStep[]=[];
 for(const modifier of modifiers){
   if(!modifier.enabled)continue;
   const before=current;
   switch(modifier.type){
     case'mirror':current=applyMirror(before,modifier);break;
     case'subdivision':current=subdivideCatmullClark(before,modifier.levels);break;
     case'solidify':current=solidifyMesh(before,modifier.thickness);break;
     default:throw new Error(`Modifier ${modifier.type} is defined but not implemented in V5.2.`);
   }
   steps.push({modifierId:modifier.id,type:modifier.type,inputVertexCount:before.vertices.length,outputVertexCount:current.vertices.length,inputFaceCount:before.faces.length,outputFaceCount:current.faces.length});
 }
 return{mesh:current,steps};
};
