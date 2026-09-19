import type { MioMeshData } from '../types/creative';
import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { flipMeshFaces, recalculateMeshWinding } from '../modes/studio3d/modeling/MeshFaceWinding';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

const inconsistentPlane=():MioMeshData=>({
 vertices:[
  {id:'v0',position:[-1,-0.5,0]},{id:'v1',position:[0,-0.5,0]},{id:'v2',position:[1,-0.5,0]},
  {id:'v3',position:[-1,0.5,0]},{id:'v4',position:[0,0.5,0]},{id:'v5',position:[1,0.5,0]},
 ],
 faces:[
  {id:'left',vertexIds:['v0','v1','v4','v3']},
  {id:'right',vertexIds:['v1','v4','v5','v2']},
 ],
});

export async function runMeshFaceWindingTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('consistent cube requires no winding changes',()=>{const r=recalculateMeshWinding(createCubeMesh());assert(r.flippedFaceIds.length===0,'cube should already be consistently wound');assert(r.componentCount===1,'cube should be one connected component')}));
 results.push(await test('recalculate fixes same-direction shared edge',()=>{const mesh=inconsistentPlane();assert(diagnoseMeshTopology(mesh).inconsistentWindingEdgeIds.length===1,'fixture must begin inconsistent');const r=recalculateMeshWinding(mesh);assert(r.flippedFaceIds.length===1,'one face should flip');assert(diagnoseMeshTopology(r.mesh).inconsistentWindingEdgeIds.length===0,'recalculated mesh should be consistent')}));
 results.push(await test('manual face flip reverses stable face vertex order',()=>{const mesh=createCubeMesh();const before=mesh.faces.find(face=>face.id==='f_front')!.vertexIds;const r=flipMeshFaces(mesh,['f_front']);const after=r.mesh.faces.find(face=>face.id==='f_front')!.vertexIds;assert(JSON.stringify(after)===JSON.stringify([...before].reverse()),'face order should reverse');assert(r.flippedFaceIds[0]==='f_front','flipped face ID should be reported')}));
 results.push(await test('non-manifold mesh is rejected by recalculation',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]},{id:'d',position:[0,-1,0]},{id:'e',position:[0,0,1]}],faces:[{id:'f1',vertexIds:['a','b','c']},{id:'f2',vertexIds:['b','a','d']},{id:'f3',vertexIds:['a','b','e']}]};let threw=false;try{recalculateMeshWinding(mesh)}catch{threw=true}assert(threw,'non-manifold winding recalc must throw')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
