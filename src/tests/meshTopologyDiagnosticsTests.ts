import type { MioMeshData } from '../types/creative';
import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { cleanupMeshTopology, diagnoseMeshTopology, meshEdgeId } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

const twoQuadPlane=(sameWinding=false):MioMeshData=>({
 vertices:[
  {id:'v0',position:[-1,-0.5,0]},{id:'v1',position:[0,-0.5,0]},{id:'v2',position:[1,-0.5,0]},
  {id:'v3',position:[-1,0.5,0]},{id:'v4',position:[0,0.5,0]},{id:'v5',position:[1,0.5,0]},
 ],
 faces:[
  {id:'left',vertexIds:['v0','v1','v4','v3']},
  {id:'right',vertexIds:sameWinding?['v1','v4','v5','v2']:['v1','v2','v5','v4']},
 ],
});

export async function runMeshTopologyDiagnosticsTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('closed cube has no boundary non-manifold or winding diagnostics',()=>{const d=diagnoseMeshTopology(createCubeMesh());assert(d.boundaryEdgeIds.length===0,'cube must be closed');assert(d.nonManifoldEdgeIds.length===0,'cube must be manifold');assert(d.inconsistentWindingEdgeIds.length===0,'cube winding should be consistent');assert(d.connectedFaceComponents.length===1,'cube should be one component')}));
 results.push(await test('open two-quad plane exposes six boundary edges',()=>{const d=diagnoseMeshTopology(twoQuadPlane());assert(d.boundaryEdgeIds.length===6,'two adjacent quads should have six boundary edges');assert(d.inconsistentWindingEdgeIds.length===0,'normal plane winding should be consistent')}));
 results.push(await test('same-direction shared edge is reported as inconsistent winding',()=>{const d=diagnoseMeshTopology(twoQuadPlane(true));assert(d.inconsistentWindingEdgeIds.includes(meshEdgeId('v1','v4')),'shared edge must be flagged')}));
 results.push(await test('duplicate rotated face and isolated vertex are diagnosed and cleaned',()=>{const mesh=twoQuadPlane();mesh.faces.push({id:'left_copy',vertexIds:['v4','v3','v0','v1']});mesh.vertices.push({id:'isolated',position:[9,9,9]});const d=diagnoseMeshTopology(mesh);assert(d.duplicateFaceGroups.some(group=>group.includes('left')&&group.includes('left_copy')),'duplicate faces should be grouped');assert(d.isolatedVertexIds.includes('isolated'),'isolated vertex should be detected');const cleaned=cleanupMeshTopology(mesh);assert(cleaned.removedFaceIds.includes('left_copy'),'lexically later duplicate should be removed');assert(cleaned.removedVertexIds.includes('isolated'),'isolated vertex should be removed');assert(cleaned.mesh.faces.length===2,'two unique faces should remain')}));
 results.push(await test('material-distinct coincident faces are not auto-cleaned as duplicates',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]}],faces:[{id:'m1',vertexIds:['a','b','c'],materialSlot:1},{id:'m2',vertexIds:['c','b','a'],materialSlot:2}]};const d=diagnoseMeshTopology(mesh);assert(d.duplicateFaceGroups.length===0,'different material slots must remain distinct');const cleaned=cleanupMeshTopology(mesh);assert(cleaned.mesh.faces.length===2,'cleanup must preserve material-distinct faces')}));
 results.push(await test('zero-area face is reported',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[2,0,0]}],faces:[{id:'line_tri',vertexIds:['a','b','c']}]};const d=diagnoseMeshTopology(mesh);assert(d.zeroAreaFaceIds.includes('line_tri'),'collinear triangle must be zero-area')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
