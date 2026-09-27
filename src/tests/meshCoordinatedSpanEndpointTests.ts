import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId } from '../modes/studio3d/modeling/MeshTopology';
import { allocateCoordinatedSpanEndpoints } from '../modes/studio3d/modeling/MeshCoordinatedSpanEndpoints';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const octa=():MioMeshData=>({vertices:[{id:'t',position:[0,0,1]},{id:'b',position:[0,0,-1]},{id:'a',position:[1,0,0]},{id:'c',position:[0,1,0]},{id:'d',position:[-1,0,0]},{id:'e',position:[0,-1,0]}],faces:[{id:'tac',vertexIds:['t','a','c']},{id:'tcd',vertexIds:['t','c','d']},{id:'tde',vertexIds:['t','d','e']},{id:'tea',vertexIds:['t','e','a']},{id:'bca',vertexIds:['b','c','a']},{id:'bdc',vertexIds:['b','d','c']},{id:'bed',vertexIds:['b','e','d']},{id:'bae',vertexIds:['b','a','e']}]});
export async function runMeshCoordinatedSpanEndpointTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 const network=()=>[canonicalMeshEdgeId('t','a'),canonicalMeshEdgeId('t','c'),canonicalMeshEdgeId('t','d'),canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('c','b'),canonicalMeshEdgeId('d','b')];
 results.push(await test('allocates one replacement endpoint per junction incident span',()=>{const p=allocateCoordinatedSpanEndpoints(octa(),network(),0.1);assert(p.transaction.junctions.length===2,'two junctions expected');assert(p.allocations.length===6,'three allocations per junction expected');assert(new Set(p.allocations.map(a=>a.replacementVertexId)).size===6,'replacement ids must be unique');assert(Object.keys(p.allocationByJunctionEdge).length===6,'allocation lookup must be complete')}));
 results.push(await test('places endpoint cuts from each junction toward its span neighbor',()=>{const p=allocateCoordinatedSpanEndpoints(octa(),network(),0.25);const ta=p.allocations.find(a=>a.junctionVertexId==='t'&&a.neighborVertexId==='a');const ba=p.allocations.find(a=>a.junctionVertexId==='b'&&a.neighborVertexId==='a');assert(!!ta&&!!ba,'both sides of t-a-b span must allocate');assert(Math.abs(ta!.position[0]-0.25)<1e-9&&Math.abs(ta!.position[2]-0.75)<1e-9,'top cut position incorrect');assert(Math.abs(ba!.position[0]-0.25)<1e-9&&Math.abs(ba!.position[2]+0.75)<1e-9,'bottom cut position incorrect')}));
 results.push(await test('is deterministic and leaves source mesh unchanged',()=>{const mesh=octa(),before=JSON.stringify(mesh);const a=allocateCoordinatedSpanEndpoints(mesh,network(),0.1),b=allocateCoordinatedSpanEndpoints(mesh,[...network()].reverse(),0.1);assert(JSON.stringify(a.allocations)===JSON.stringify(b.allocations),'allocation must not depend on input edge order');assert(JSON.stringify(mesh)===before,'source mesh must remain unchanged')}));
 results.push(await test('rejects unsafe width before geometry allocation',()=>{let threw=false;try{allocateCoordinatedSpanEndpoints(octa(),network(),0.5)}catch{threw=true}assert(threw,'unsafe width must reject')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
