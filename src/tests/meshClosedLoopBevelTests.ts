import type { MioMeshData, MioMeshFace } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, deriveMeshEdges, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { bevelClosedEdgeLoop } from '../modes/studio3d/modeling/MeshClosedLoopBevel';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

const twoQuadPlane=():MioMeshData=>({
 vertices:[
  {id:'v0',position:[-1,-0.5,0]},{id:'v1',position:[0,-0.5,0]},{id:'v2',position:[1,-0.5,0]},
  {id:'v3',position:[-1,0.5,0]},{id:'v4',position:[0,0.5,0]},{id:'v5',position:[1,0.5,0]},
 ],
 faces:[
  {id:'left',vertexIds:['v0','v1','v4','v3']},
  {id:'right',vertexIds:['v1','v2','v5','v4']},
 ],
});

export async function runMeshClosedLoopBevelTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('closed cube loop bevel creates chamfer strip with manifold winding',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const r=bevelClosedEdgeLoop(cut.mesh,cut.newLoopEdgeIds,0.1);assert(r.removedVertexIds.length===4,'four cut-loop vertices should be replaced');assert(r.createdVertexIds.length===8,'each loop vertex should produce two bevel vertices');assert(r.bevelFaceIds.length===4,'one bevel quad per selected loop edge');assert(r.mesh.vertices.length===16,'cube loop bevel should result in sixteen vertices');assert(r.mesh.faces.length===14,'cube loop bevel should result in fourteen faces');assert(r.side0LoopEdgeIds.length===4&&r.side1LoopEdgeIds.length===4,'both bevel boundary loops should have four edges');assert(validateMeshTopology(r.mesh).valid,'bevel result must remain valid');const d=diagnoseMeshTopology(r.mesh);assert(d.nonManifoldEdgeIds.length===0,'bevel must remain manifold');assert(d.inconsistentWindingEdgeIds.length===0,'bevel winding must remain consistent')}));
 results.push(await test('open loop bevel is rejected',()=>{const cut=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);let threw=false;try{bevelClosedEdgeLoop(cut.mesh,cut.newLoopEdgeIds,0.1)}catch{threw=true}assert(threw,'open cut path must be rejected')}));
 results.push(await test('bevel width cannot exceed local rail space',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.2);let threw=false;try{bevelClosedEdgeLoop(cut.mesh,cut.newLoopEdgeIds,0.25)}catch{threw=true}assert(threw,'bevel width beyond one side of rail must be rejected')}));
 results.push(await test('material boundary across selected bevel edge is rejected',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const edgeId=cut.newLoopEdgeIds[0];const edge=deriveMeshEdges(cut.mesh).find(item=>item.id===edgeId);if(!edge)throw new Error('fixture must resolve selected edge');const edgeFaces=edge.faceIds.map(faceId=>cut.mesh.faces.find(face=>face.id===faceId)).filter((face):face is MioMeshFace=>Boolean(face));assert(edgeFaces.length===2,'fixture must resolve selected edge faces');edgeFaces[0].materialSlot=1;edgeFaces[1].materialSlot=2;let threw=false;try{bevelClosedEdgeLoop(cut.mesh,cut.newLoopEdgeIds,0.1)}catch{threw=true}assert(threw,'material boundary must reject bevel')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
