import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { rewriteCoordinatedJunctionFaces } from '../modes/studio3d/modeling/MeshCoordinatedFaceRewrite';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const octa=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[0,1,0]},{id:'d',position:[-1,0,0]},{id:'e',position:[0,-1,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tde',vertexIds:['t','d','e']},{id:'tea',vertexIds:['t','e','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bed',vertexIds:['b','e','d']},{id:'bae',vertexIds:['b','a','e']}]});
const network=()=>[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];
export async function runMeshCoordinatedFaceRewriteTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('rewrites two separated tri-junctions into watertight miter caps',()=>{const r=rewriteCoordinatedJunctionFaces(octa(),network(),0.1);assert(r.miterFaceIds.length===2,'two miter caps expected');assert(r.removedJunctionVertexIds.join(',')==='b,t','both junction vertices removed');assert(!r.mesh.vertices.some(v=>v.id==='t'||v.id==='b'),'source junction vertices must be replaced');assert(validateMeshTopology(r.mesh).valid,'result topology validates');const d=diagnoseMeshTopology(r.mesh);assert(d.boundaryEdgeIds.length===0,'result watertight');assert(d.nonManifoldEdgeIds.length===0,'result manifold');assert(d.inconsistentWindingEdgeIds.length===0,'winding consistent');assert(d.zeroAreaFaceIds.length===0,'no zero area faces')}));
 results.push(await test('uses the six canonical shared endpoint allocations',()=>{const r=rewriteCoordinatedJunctionFaces(octa(),network(),0.2);assert(r.endpointPlan.allocations.length===6,'six shared allocations expected');for(const a of r.endpointPlan.allocations)assert(r.mesh.vertices.some(v=>v.id===a.replacementVertexId),'every allocation must exist in output mesh')}));
 results.push(await test('is atomic with respect to source mesh',()=>{const mesh=octa(),before=JSON.stringify(mesh);rewriteCoordinatedJunctionFaces(mesh,network(),0.1);assert(JSON.stringify(mesh)===before,'source mesh must remain unchanged')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
