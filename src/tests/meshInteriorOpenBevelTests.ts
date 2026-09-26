import { canonicalMeshEdgeId, createCubeMesh, deriveMeshEdges, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { bevelInteriorOpenEdgePath } from '../modes/studio3d/modeling/MeshInteriorOpenBevel';
import { bevelOpenEdgePath } from '../modes/studio3d/modeling/MeshOpenBevel';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshInteriorOpenBevelTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('interior subset of cube loop terminates with two manifold cap triangles',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const selected=cut.newLoopEdgeIds.slice(0,2);const r=bevelInteriorOpenEdgePath(cut.mesh,selected,0.1);assert(r.endpointVertexIds.length===2,'two endpoints required');assert(r.bevelFaceIds.length===2,'one chamfer face per selected edge');assert(r.terminationFaceIds.length===2,'one termination triangle per interior endpoint');assert(r.createdVertexIds.length===6,'three selected path vertices should create six bevel vertices');assert(r.removedVertexIds.length===1,'only the internal path vertex should be removed; endpoint fan spines stay');assert(validateMeshTopology(r.mesh).valid,'result must remain valid');const d=diagnoseMeshTopology(r.mesh);assert(d.nonManifoldEdgeIds.length===0,'result must remain manifold');assert(d.inconsistentWindingEdgeIds.length===0,'result winding must remain consistent');const edges=deriveMeshEdges(r.mesh);for(const endpointId of r.endpointVertexIds){const incident=edges.filter(edge=>edge.vertexIds.includes(endpointId));assert(incident.every(edge=>edge.faceIds.length===2),'interior endpoint fan edges must remain manifold')}}));
 results.push(await test('generic open bevel routes interior endpoints to fan solver',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const r=bevelOpenEdgePath(cut.mesh,cut.newLoopEdgeIds.slice(0,2),0.1);assert(r.endpointKind==='interior','closed-surface endpoints should route to interior solver')}));
 results.push(await test('interior solver rejects a closed loop',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);let threw=false;try{bevelInteriorOpenEdgePath(cut.mesh,cut.newLoopEdgeIds,0.1)}catch{threw=true}assert(threw,'closed loop must be rejected')}));
 results.push(await test('interior solver rejects excessive rail width',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.2);let threw=false;try{bevelInteriorOpenEdgePath(cut.mesh,cut.newLoopEdgeIds.slice(0,2),0.25)}catch{threw=true}assert(threw,'width beyond rail space must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
