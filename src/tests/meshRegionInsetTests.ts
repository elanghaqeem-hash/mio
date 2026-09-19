import type { MioMeshData } from '../types/creative';
import { validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { insetMeshRegion } from '../modes/studio3d/modeling/MeshRegionInset';

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

export async function runMeshRegionInsetTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('two adjacent quads inset as one connected region',()=>{const r=insetMeshRegion(twoQuadPlane(),['left','right'],0.25);assert(r.createdVertexIds.length===6,'expected six shared-region duplicates');assert(r.insetFaceIds.length===2,'expected two inset cap faces');assert(r.createdRingFaceIds.length===6,'shared edge must not create a ring face');assert(r.mesh.faces.length===8,'expected two inset faces plus six boundary ring faces');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('region inset preserves internal shared topology',()=>{const r=insetMeshRegion(twoQuadPlane(),['left','right'],0.5);const left=r.mesh.faces.find(face=>face.id===r.insetFaceIds[0]);const right=r.mesh.faces.find(face=>face.id===r.insetFaceIds[1]);if(!left||!right)throw new Error('inset faces required');const shared=left.vertexIds.filter(id=>right.vertexIds.includes(id));assert(shared.length===2,'inset caps must share the duplicated internal edge')}));
 results.push(await test('non-coplanar region is rejected',()=>{const mesh: MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[1,1,0]},{id:'d',position:[0,1,0]},{id:'e',position:[1,0,1]},{id:'f',position:[1,1,1]}],faces:[{id:'flat',vertexIds:['a','b','c','d']},{id:'upright',vertexIds:['b','e','f','c']}]};let threw=false;try{insetMeshRegion(mesh,['flat','upright'],0.25)}catch{threw=true}assert(threw,'non-coplanar region must be rejected')}));
 results.push(await test('disconnected face region is rejected',()=>{const mesh=twoQuadPlane();mesh.vertices.push({id:'x0',position:[3,0,0]},{id:'x1',position:[4,0,0]},{id:'x2',position:[4,1,0]},{id:'x3',position:[3,1,0]});mesh.faces.push({id:'island',vertexIds:['x0','x1','x2','x3']});let threw=false;try{insetMeshRegion(mesh,['left','island'],0.2)}catch{threw=true}assert(threw,'disconnected region must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
