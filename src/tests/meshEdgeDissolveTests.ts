import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { dissolveMeshEdge } from '../modes/studio3d/modeling/MeshEdgeDissolve';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

const twoQuadPlane=(materialRight?:number):MioMeshData=>({
 vertices:[
  {id:'v0',position:[-1,-0.5,0]},{id:'v1',position:[0,-0.5,0]},{id:'v2',position:[1,-0.5,0]},
  {id:'v3',position:[-1,0.5,0]},{id:'v4',position:[0,0.5,0]},{id:'v5',position:[1,0.5,0]},
 ],
 faces:[
  {id:'left',vertexIds:['v0','v1','v4','v3'],materialSlot:1},
  {id:'right',vertexIds:['v1','v2','v5','v4'],materialSlot:materialRight??1},
 ],
});

export async function runMeshEdgeDissolveTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('shared manifold edge dissolves into one polygon',()=>{const mesh=twoQuadPlane();const r=dissolveMeshEdge(mesh,canonicalMeshEdgeId('v1','v4'));assert(r.mesh.faces.length===1,'two quads should merge to one face');const face=r.mesh.faces[0];assert(face.vertexIds.length===6,'merged boundary should have six vertices');assert(new Set(face.vertexIds).size===6,'merged face must not repeat vertices');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('lexical face ID survives dissolve',()=>{const r=dissolveMeshEdge(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'));assert(r.survivorFaceId==='left','lexical face identity should survive');assert(r.removedFaceId==='right','other face should be removed')}));
 results.push(await test('boundary edge dissolve is rejected',()=>{let threw=false;try{dissolveMeshEdge(twoQuadPlane(),canonicalMeshEdgeId('v0','v1'))}catch{threw=true}assert(threw,'boundary edge must be rejected')}));
 results.push(await test('material boundary dissolve is rejected',()=>{let threw=false;try{dissolveMeshEdge(twoQuadPlane(2),canonicalMeshEdgeId('v1','v4'))}catch{threw=true}assert(threw,'material boundary must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
