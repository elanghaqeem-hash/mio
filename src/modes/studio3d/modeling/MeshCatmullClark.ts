import type { MioMeshData,MioMeshVertex } from '../../../types/creative';
import { canonicalMeshEdgeId,deriveMeshEdges,validateMeshTopology } from './MeshTopology';
import { diagnoseMeshTopology } from './MeshTopologyDiagnostics';
type V=[number,number,number];const avg=(ps:V[]):V=>{const n=ps.length||1;return ps.reduce<V>((a,p)=>[a[0]+p[0]/n,a[1]+p[1]/n,a[2]+p[2]/n],[0,0,0])};
const add=(a:V,b:V):V=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];const scale=(a:V,s:number):V=>[a[0]*s,a[1]*s,a[2]*s];
export const subdivideCatmullClarkOnce=(mesh:MioMeshData):MioMeshData=>{
 const validation=validateMeshTopology(mesh);if(!validation.valid)throw new Error(`Cannot subdivide invalid mesh: ${validation.errors.join(' ')}`);
 const d=diagnoseMeshTopology(mesh);if(d.nonManifoldEdgeIds.length)throw new Error('Catmull-Clark requires manifold edges.');
 const vb=new Map(mesh.vertices.map(v=>[v.id,v])),fb=new Map(mesh.faces.map(f=>[f.id,f])),edges=deriveMeshEdges(mesh),eb=new Map(edges.map(e=>[e.id,e]));
 const facePoint=new Map<string,V>();for(const f of mesh.faces)facePoint.set(f.id,avg(f.vertexIds.map(id=>vb.get(id)!.position)));
 const edgePoint=new Map<string,V>();for(const e of edges){const ends=e.vertexIds.map(id=>vb.get(id)!.position);edgePoint.set(e.id,e.faceIds.length===2?avg([...ends,...e.faceIds.map(id=>facePoint.get(id)!)]):avg(ends))}
 const incidentFaces=new Map<string,Set<string>>(),incidentEdges=new Map<string,typeof edges>();
 for(const v of mesh.vertices){incidentFaces.set(v.id,new Set);incidentEdges.set(v.id,[])}
 for(const f of mesh.faces)for(const id of f.vertexIds)incidentFaces.get(id)!.add(f.id);
 for(const e of edges)for(const id of e.vertexIds)incidentEdges.get(id)!.push(e);
 const moved=new Map<string,V>();
 for(const v of mesh.vertices){const ies=incidentEdges.get(v.id)!,boundary=ies.filter(e=>e.faceIds.length===1);if(boundary.length){const neighbors=boundary.map(e=>vb.get(e.vertexIds[0]===v.id?e.vertexIds[1]:e.vertexIds[0])!.position);moved.set(v.id,neighbors.length===2?add(scale(v.position,0.75),scale(avg(neighbors),0.25)):v.position);continue}const faces=[...incidentFaces.get(v.id)!],n=faces.length,F=avg(faces.map(id=>facePoint.get(id)!)),R=avg(ies.map(e=>avg(e.vertexIds.map(id=>vb.get(id)!.position))));moved.set(v.id,scale(add(add(F,scale(R,2)),scale(v.position,n-3)),1/n))}
 const vertices:MioMeshVertex[]=[...mesh.vertices.map(v=>({id:`${v.id}_cc`,position:moved.get(v.id)!})),...edges.map(e=>({id:`${e.id}_cc`,position:edgePoint.get(e.id)!})),...mesh.faces.map(f=>({id:`${f.id}_cc`,position:facePoint.get(f.id)!}))];
 const faces:MioMeshData['faces']=[];for(const f of mesh.faces){for(let i=0;i<f.vertexIds.length;i++){const cur=f.vertexIds[i],next=f.vertexIds[(i+1)%f.vertexIds.length],prev=f.vertexIds[(i-1+f.vertexIds.length)%f.vertexIds.length];faces.push({id:`${f.id}_cc_${i}`,vertexIds:[`${cur}_cc`,`${canonicalMeshEdgeId(cur,next)}_cc`,`${f.id}_cc`,`${canonicalMeshEdgeId(prev,cur)}_cc`],...(f.materialSlot===undefined?{}:{materialSlot:f.materialSlot})})}}
 const result={vertices,faces};const final=validateMeshTopology(result),fd=diagnoseMeshTopology(result);if(!final.valid||fd.nonManifoldEdgeIds.length||fd.inconsistentWindingEdgeIds.length||fd.zeroAreaFaceIds.length)throw new Error('Catmull-Clark produced unsafe topology.');return result;
};
export const subdivideCatmullClark=(mesh:MioMeshData,levels:number):MioMeshData=>{if(!Number.isInteger(levels)||levels<1||levels>3)throw new Error('Subdivision levels must be an integer from 1 to 3.');let current=structuredClone(mesh);for(let i=0;i<levels;i++)current=subdivideCatmullClarkOnce(current);return current};
