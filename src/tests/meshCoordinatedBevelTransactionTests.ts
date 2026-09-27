import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId } from '../modes/studio3d/modeling/MeshTopology';
import { compileCoordinatedBevelTransaction } from '../modes/studio3d/modeling/MeshCoordinatedBevelTransaction';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const octa=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[0,1,0]},{id:'d',position:[-1,0,0]},{id:'e',position:[0,-1,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tde',vertexIds:['t','d','e']},{id:'tea',vertexIds:['t','e','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bed',vertexIds:['b','e','d']},{id:'bae',vertexIds:['b','a','e']}]});
const tetra=():MioMeshData=>({vertices:[{id:'a',position:[1,1,1]},{id:'b',position:[-1,-1,1]},{id:'c',position:[-1,1,-1]},{id:'d',position:[1,-1,-1]}],faces:[{id:'f1',vertexIds:['a','c','b']},{id:'f2',vertexIds:['a','b','d']},{id:'f3',vertexIds:['a','d','c']},{id:'f4',vertexIds:['b','c','d']}]});
export async function runMeshCoordinatedBevelTransactionTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('compiles a two-junction network into spans then junction phases',()=>{const mesh=octa();const edges=[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];const tx=compileCoordinatedBevelTransaction(mesh,edges);assert(tx.junctions.length===2,'two junction transactions expected');assert(tx.spans.length===3,'three span transactions expected');assert(tx.ready,'two-edge spans should have no direct shared-edge conflict');assert(tx.executionOrder.at(-1)==='commit:once','commit must be final phase');assert(tx.executionOrder.at(-2)==='validate:whole-mesh','whole mesh validation precedes commit')}));
 results.push(await test('detects a direct selected edge shared by two junction solvers',()=>{const mesh=tetra();const edges=[canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('a','c'),canonicalMeshEdgeId('a','d'),canonicalMeshEdgeId('b','c'),canonicalMeshEdgeId('b','d')];const tx=compileCoordinatedBevelTransaction(mesh,edges);assert(!tx.ready,'direct junction-to-junction span must conflict');assert(tx.conflicts.some(x=>x.includes('shared-edge-between-junctions')),'shared-edge conflict expected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
