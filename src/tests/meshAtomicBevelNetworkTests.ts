import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';
import { executeAtomicBevelNetwork } from '../modes/studio3d/modeling/MeshAtomicBevelNetwork';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const tetra=():MioMeshData=>({vertices:[{id:'a',position:[1,1,1]},{id:'b',position:[-1,-1,1]},{id:'c',position:[-1,1,-1]},{id:'d',position:[1,-1,-1]}],faces:[{id:'f1',vertexIds:['a','c','b']},{id:'f2',vertexIds:['a','b','d']},{id:'f3',vertexIds:['a','d','c']},{id:'f4',vertexIds:['b','c','d']}]});
const pyramid=():MioMeshData=>({vertices:[{id:'top',position:[0,0,1]},{id:'a',position:[-1,-1,0]},{id:'b',position:[1,-1,0]},{id:'c',position:[1,1,0]},{id:'d',position:[-1,1,0]}],faces:[{id:'side_ab',vertexIds:['top','a','b']},{id:'side_bc',vertexIds:['top','b','c']},{id:'side_cd',vertexIds:['top','c','d']},{id:'side_da',vertexIds:['top','d','a']},{id:'base',vertexIds:['a','d','c','b']}]});
const bipyramid=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[-0.5,0.866,0]},{id:'d',position:[-0.5,-0.866,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tda',vertexIds:['t','d','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bad',vertexIds:['b','a','d']}]});

export async function runMeshAtomicBevelNetworkTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('routes a closed loop atomically',()=>{const cut=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);const r=executeAtomicBevelNetwork(cut.mesh,cut.newLoopEdgeIds,0.1);assert(r.strategy==='closed-loop','closed loop strategy expected');assert(r.createdFaceIds.length===cut.newLoopEdgeIds.length,'one bevel face per loop edge')}));
 results.push(await test('routes a tri-corner star atomically',()=>{const mesh=tetra(),edges=['b','c','d'].map(v=>canonicalMeshEdgeId('a',v));const r=executeAtomicBevelNetwork(mesh,edges,0.2);assert(r.strategy==='tri-corner','tri-corner strategy expected');assert(diagnoseMeshTopology(r.mesh).boundaryEdgeIds.length===0,'tri result watertight')}));
 results.push(await test('routes a degree-4 star atomically',()=>{const mesh=pyramid(),edges=['a','b','c','d'].map(v=>canonicalMeshEdgeId('top',v));const r=executeAtomicBevelNetwork(mesh,edges,0.2);assert(r.strategy==='multi-pole','multi-pole strategy expected');assert(diagnoseMeshTopology(r.mesh).boundaryEdgeIds.length===0,'multi-pole result watertight')}));
 results.push(await test('routes a validated coordinated multi-junction network atomically',()=>{const mesh=bipyramid(),before=JSON.stringify(mesh);const edges=[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];const r=executeAtomicBevelNetwork(mesh,edges,0.1);assert(r.strategy==='coordinated-network','coordinated network strategy expected');assert(r.createdFaceIds.length===8,'two miter caps plus six explicit corridor bevel faces expected');const d=diagnoseMeshTopology(r.mesh);assert(d.boundaryEdgeIds.length===0,'coordinated result watertight');assert(d.nonManifoldEdgeIds.length===0,'coordinated result manifold');assert(JSON.stringify(mesh)===before,'source mesh must remain unchanged')}));
 results.push(await test('rejects invalid width without mutating source',()=>{const mesh=pyramid(),before=JSON.stringify(mesh),edges=['a','b','c','d'].map(v=>canonicalMeshEdgeId('top',v));let threw=false;try{executeAtomicBevelNetwork(mesh,edges,0.5)}catch{threw=true}assert(threw,'invalid width must reject');assert(JSON.stringify(mesh)===before,'source mesh must remain unchanged')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
