import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId } from '../modes/studio3d/modeling/MeshTopology';
import { constructCoordinatedBevelStripPlan } from '../modes/studio3d/modeling/MeshCoordinatedBevelStrips';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const mesh=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[-0.5,0.866,0]},{id:'d',position:[-0.5,-0.866,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tda',vertexIds:['t','d','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bad',vertexIds:['b','a','d']}]});
const edges=()=>[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];
export async function runMeshCoordinatedBevelStripTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('builds deterministic corridors between coordinated replacement endpoints',()=>{const p=constructCoordinatedBevelStripPlan(mesh(),edges(),0.1);assert(p.corridors.length===3,'three junction-to-junction corridors expected');for(const c of p.corridors){assert(c.rewrittenVertexIds.length===3,'each bipyramid corridor should have replacement/interior/replacement vertices');assert(c.rewrittenEdgeIds.length===2,'each corridor should contain two rewritten edges');assert(c.rewrittenVertexIds[0]===c.startReplacementVertexId,'start replacement owns corridor start');assert(c.rewrittenVertexIds.at(-1)===c.endReplacementVertexId,'end replacement owns corridor end')}}));
 results.push(await test('keeps source mesh immutable',()=>{const source=mesh(),before=JSON.stringify(source);constructCoordinatedBevelStripPlan(source,edges(),0.1);assert(JSON.stringify(source)===before,'source mesh must remain unchanged')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
