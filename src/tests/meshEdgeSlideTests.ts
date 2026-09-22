import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { slideMeshEdgeLoop } from '../modes/studio3d/modeling/MeshEdgeSlide';

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

export async function runMeshEdgeSlideTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('open loop-cut edge path slides consistently along rails',()=>{const cut=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);const slid=slideMeshEdgeLoop(cut.mesh,cut.newLoopEdgeIds,0.25);assert(!slid.closed,'open cut should slide as an open path');assert(slid.mesh.vertices.length===cut.mesh.vertices.length,'slide must not change topology counts');assert(slid.mesh.faces.length===cut.mesh.faces.length,'slide must not change face count');const ys=slid.movedVertexIds.map(id=>slid.mesh.vertices.find(vertex=>vertex.id===id)!.position[1]);assert(Math.max(...ys)-Math.min(...ys)<1e-9,'all path vertices should use one coherent rail ratio');assert(validateMeshTopology(slid.mesh).valid,'slid mesh must remain valid')}));
 results.push(await test('closed cube cut loop slides while preserving topology',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const slid=slideMeshEdgeLoop(cut.mesh,cut.newLoopEdgeIds,0.75);assert(slid.closed,'cube cut loop should remain closed');assert(slid.movedVertexIds.length===cut.newVertexIds.length,'all cut vertices should move');assert(slid.mesh.faces.length===cut.mesh.faces.length,'face topology must remain unchanged');assert(validateMeshTopology(slid.mesh).valid,'closed slide must remain valid')}));
 results.push(await test('arbitrary cube edge is rejected because endpoints are not on inferred rails',()=>{let threw=false;try{slideMeshEdgeLoop(createCubeMesh(),[canonicalMeshEdgeId('v0','v1')],0.25)}catch{threw=true}assert(threw,'non-slideable cube edge must be rejected')}));
 results.push(await test('ratio bounds are enforced',()=>{const cut=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);for(const ratio of [0,1,-0.1,1.1]){let threw=false;try{slideMeshEdgeLoop(cut.mesh,cut.newLoopEdgeIds,ratio)}catch{threw=true}assert(threw,`ratio ${ratio} must throw`)}}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
