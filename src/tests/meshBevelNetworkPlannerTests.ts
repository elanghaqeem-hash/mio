import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId } from '../modes/studio3d/modeling/MeshTopology';
import { planBevelNetwork } from '../modes/studio3d/modeling/MeshBevelNetworkPlanner';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const octa=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[0,1,0]},{id:'d',position:[-1,0,0]},{id:'e',position:[0,-1,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tde',vertexIds:['t','d','e']},{id:'tea',vertexIds:['t','e','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bed',vertexIds:['b','e','d']},{id:'bae',vertexIds:['b','a','e']}]});
export async function runMeshBevelNetworkPlannerTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('decomposes a degree-4 star into four endpoint spans',()=>{const mesh=octa(),edges=['a','c','d','e'].map(v=>canonicalMeshEdgeId('t',v));const p=planBevelNetwork(mesh,edges);assert(p.connected&&p.executable,'star should be connected/executable');assert(p.nodes.filter(n=>n.kind==='junction').length===1,'one junction expected');assert(p.nodes.find(n=>n.vertexId==='t')?.selectedDegree===4,'junction degree four expected');assert(p.spans.length===4,'four spans expected');assert(p.spans.every(s=>s.edgeIds.length===1),'star spans are one edge each')}));
 results.push(await test('decomposes a Y network into three ordered multi-edge spans',()=>{const mesh=octa();const edges=[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];const p=planBevelNetwork(mesh,edges);assert(p.connected,'network connected');assert(p.nodes.filter(n=>n.kind==='junction').length===2,'t and b are degree-three junctions');assert(p.spans.length===3,'three spans should connect the junctions');assert(p.spans.every(s=>s.edgeIds.length===2),'each span should contain two edges')}));
 results.push(await test('rejects disconnected execution plan but still reports decomposition',()=>{const mesh=octa();const edges=[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('b','d')];const p=planBevelNetwork(mesh,edges);assert(!p.connected&&!p.executable,'disconnected plan must not execute');assert(!!p.reason,'reason required')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
