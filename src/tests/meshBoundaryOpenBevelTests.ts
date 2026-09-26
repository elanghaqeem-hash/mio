import type { MioMeshData, MioMeshFace } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, deriveMeshEdges, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { bevelBoundaryOpenEdgePath } from '../modes/studio3d/modeling/MeshBoundaryOpenBevel';

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

export async function runMeshBoundaryOpenBevelTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('boundary-to-boundary open cut bevel creates chamfer strip and two cap edges',()=>{const cut=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);const r=bevelBoundaryOpenEdgePath(cut.mesh,cut.newLoopEdgeIds,0.1);assert(r.removedVertexIds.length===3,'three open-path vertices should be replaced');assert(r.createdVertexIds.length===6,'each path vertex should produce two bevel vertices');assert(r.bevelFaceIds.length===2,'one bevel face per selected path edge');assert(r.endpointCapEdgeIds.length===2,'two endpoint cap edges required');assert(r.side0PathEdgeIds.length===2&&r.side1PathEdgeIds.length===2,'both bevel side paths should contain two edges');assert(r.mesh.vertices.length===12,'open bevel should result in twelve vertices');assert(r.mesh.faces.length===6,'open bevel should add two chamfer faces');assert(validateMeshTopology(r.mesh).valid,'open bevel result must remain valid');const d=diagnoseMeshTopology(r.mesh);assert(d.nonManifoldEdgeIds.length===0,'open bevel must remain manifold');assert(d.inconsistentWindingEdgeIds.length===0,'open bevel winding must remain consistent');const edges=new Map(deriveMeshEdges(r.mesh).map(edge=>[edge.id,edge]));assert(r.endpointCapEdgeIds.every(id=>edges.get(id)?.faceIds.length===1),'endpoint caps must remain boundary edges')}));
 results.push(await test('closed loop selection is rejected by boundary-open bevel',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);let threw=false;try{bevelBoundaryOpenEdgePath(cut.mesh,cut.newLoopEdgeIds,0.1)}catch{threw=true}assert(threw,'closed loop must use closed-loop bevel')}));
 results.push(await test('open subset on a closed surface is rejected because endpoints are not boundary-safe',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);let threw=false;try{bevelBoundaryOpenEdgePath(cut.mesh,cut.newLoopEdgeIds.slice(0,2),0.1)}catch{threw=true}assert(threw,'interior endpoints must be rejected')}));
 results.push(await test('open bevel width cannot exceed local rail space',()=>{const cut=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.2);let threw=false;try{bevelBoundaryOpenEdgePath(cut.mesh,cut.newLoopEdgeIds,0.25)}catch{threw=true}assert(threw,'width beyond available rail space must be rejected')}));
 results.push(await test('material boundary across selected open bevel edge is rejected',()=>{const cut=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);const edge=deriveMeshEdges(cut.mesh).find(item=>item.id===cut.newLoopEdgeIds[0]);if(!edge)throw new Error('fixture must resolve selected edge');const edgeFaces=edge.faceIds.map(faceId=>cut.mesh.faces.find(face=>face.id===faceId)).filter((face):face is MioMeshFace=>Boolean(face));assert(edgeFaces.length===2,'fixture must resolve both incident faces');edgeFaces[0].materialSlot=1;edgeFaces[1].materialSlot=2;let threw=false;try{bevelBoundaryOpenEdgePath(cut.mesh,cut.newLoopEdgeIds,0.1)}catch{threw=true}assert(threw,'material boundary must reject open bevel')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
