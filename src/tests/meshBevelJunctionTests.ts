import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { analyzeBevelSelectionTopology } from '../modes/studio3d/modeling/MeshBevelJunction';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const tetra=():MioMeshData=>({vertices:[{id:'a',position:[1,1,1]},{id:'b',position:[-1,-1,1]},{id:'c',position:[-1,1,-1]},{id:'d',position:[1,-1,-1]}],faces:[{id:'f1',vertexIds:['a','c','b']},{id:'f2',vertexIds:['a','b','d']},{id:'f3',vertexIds:['a','d','c']},{id:'f4',vertexIds:['b','c','d']}]});

export async function runMeshBevelJunctionTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('classifies a regular closed bevel loop',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const r=analyzeBevelSelectionTopology(cut.mesh,cut.newLoopEdgeIds);assert(r.kind==='closed-loop','expected closed loop');assert(r.supported,'existing closed loop must remain supported');assert(r.junctions.length===0,'closed loop has no junction')}));
 results.push(await test('classifies a regular open bevel path',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const r=analyzeBevelSelectionTopology(cut.mesh,cut.newLoopEdgeIds.slice(0,2));assert(r.kind==='open-path','expected open path');assert(r.endpoints.length===2,'open path has two endpoints');assert(r.supported,'existing open path must remain supported')}));
 results.push(await test('detects a degree-three tri-corner miter requirement',()=>{const mesh=tetra();const edges=[canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('a','c'),canonicalMeshEdgeId('a','d')];const r=analyzeBevelSelectionTopology(mesh,edges);assert(r.kind==='junction-network','expected junction network');assert(!r.supported,'junction must not silently enter path solver');assert(r.junctions.length===1,'expected one junction');assert(r.junctions[0].selectedDegree===3,'expected degree three');assert(r.junctions[0].miterKind==='tri-corner','degree three should request tri-corner miter')}));
 results.push(await test('rejects disconnected edge selections deterministically',()=>{const mesh=tetra();const edges=[canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','d')];const r=analyzeBevelSelectionTopology(mesh,edges);assert(!r.connected&&!r.supported,'disconnected selection must be unsupported');assert(r.reason?.includes('connected'),'reason should explain connectivity')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
