import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { discoverQuadEdgeRing } from '../modes/studio3d/modeling/MeshEdgeRing';

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

export async function runMeshEdgeRingTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('shared edge discovers complete open ring across two quads',()=>{const seed=canonicalMeshEdgeId('v1','v4');const r=discoverQuadEdgeRing(twoQuadPlane(),seed);assert(r.edgeIds.length===3,'ring should contain left boundary, seed, right boundary');assert(r.edgeIds.includes(canonicalMeshEdgeId('v0','v3')),'left opposite edge required');assert(r.edgeIds.includes(canonicalMeshEdgeId('v2','v5')),'right opposite edge required');assert(r.faceIds.length===2,'both quads should be traversed');assert(r.closed===false,'plane strip should be open')}));
 results.push(await test('boundary seed walks through quad strip to opposite boundary',()=>{const seed=canonicalMeshEdgeId('v0','v3');const r=discoverQuadEdgeRing(twoQuadPlane(),seed);assert(r.edgeIds.length===3,'boundary-start ring should traverse three parallel edges');assert(r.edgeIds[r.edgeIds.length-1]===canonicalMeshEdgeId('v2','v5'),'opposite boundary should terminate ring')}));
 results.push(await test('cube edge ring closes around quad surface',()=>{const seed=canonicalMeshEdgeId('v0','v1');const r=discoverQuadEdgeRing(createCubeMesh(),seed);assert(r.closed,'cube ring should close');assert(r.edgeIds.length===4,'cube quad ring should contain four parallel edges');assert(new Set(r.edgeIds).size===4,'closed ring must not duplicate seed')})); 
 results.push(await test('triangle seed is rejected',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]}],faces:[{id:'tri',vertexIds:['a','b','c']}]};let threw=false;try{discoverQuadEdgeRing(mesh,canonicalMeshEdgeId('a','b'))}catch{threw=true}assert(threw,'triangle ring traversal must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
