import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { replaceCoordinatedCorridorEdges } from '../modes/studio3d/modeling/MeshCoordinatedCorridorReplacement';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const mesh=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[-0.5,0.866,0]},{id:'d',position:[-0.5,-0.866,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tda',vertexIds:['t','d','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bad',vertexIds:['b','a','d']}]});
const edges=()=>[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];
export async function runMeshCoordinatedCorridorReplacementTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('replaces all coordinated corridors with explicit bevel faces',()=>{const r=replaceCoordinatedCorridorEdges(mesh(),edges(),0.08);assert(r.replacedSpanIds.length===3,'three corridors expected');assert(r.bevelFaceIds.length===6,'two corridor edges per span should create six bevel faces');assert(r.terminationFaceIds.length===0,'miter caps terminate corridor rails directly');const d=diagnoseMeshTopology(r.mesh);assert(d.boundaryEdgeIds.length===0,'result watertight');assert(d.nonManifoldEdgeIds.length===0,'result manifold');assert(d.inconsistentWindingEdgeIds.length===0,'winding consistent');assert(d.zeroAreaFaceIds.length===0,'no zero-area faces')}));
 results.push(await test('is atomic and deterministic',()=>{const source=mesh(),before=JSON.stringify(source);const a=replaceCoordinatedCorridorEdges(source,edges(),0.08);const b=replaceCoordinatedCorridorEdges(source,[...edges()].reverse(),0.08);assert(JSON.stringify(source)===before,'source mesh immutable');assert(JSON.stringify(a.mesh)===JSON.stringify(b.mesh),'result independent of selected edge order')}));
 results.push(await test('rejects unsafe width without mutating source',()=>{const source=mesh(),before=JSON.stringify(source);let threw=false;try{replaceCoordinatedCorridorEdges(source,edges(),0.5)}catch{threw=true}assert(threw,'unsafe width must reject');assert(JSON.stringify(source)===before,'source unchanged on rejection')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
