import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { bevelTriCornerJunction } from '../modes/studio3d/modeling/MeshTriCornerMiter';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const tetra=():MioMeshData=>({vertices:[{id:'a',position:[1,1,1]},{id:'b',position:[-1,-1,1]},{id:'c',position:[-1,1,-1]},{id:'d',position:[1,-1,-1]}],faces:[{id:'f1',vertexIds:['a','c','b']},{id:'f2',vertexIds:['a','b','d']},{id:'f3',vertexIds:['a','d','c']},{id:'f4',vertexIds:['b','c','d']}]});
const edges=[canonicalMeshEdgeId('a','b'),canonicalMeshEdgeId('a','c'),canonicalMeshEdgeId('a','d')];

export async function runMeshTriCornerMiterTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('bevels a manifold valence-3 tetra corner into a watertight triangular miter',()=>{const r=bevelTriCornerJunction(tetra(),edges,0.2);assert(r.createdVertexIds.length===3,'tri-corner should create three cut vertices');assert(r.miterFaceIds.length===1,'tri-corner should create one miter face');assert(!r.mesh.vertices.some(v=>v.id==='a'),'source junction vertex should be removed');assert(r.mesh.faces.length===5,'three incident faces are rewired and one miter face added');assert(validateMeshTopology(r.mesh).valid,'result topology should validate');const d=diagnoseMeshTopology(r.mesh);assert(d.boundaryEdgeIds.length===0,'result must be watertight');assert(d.nonManifoldEdgeIds.length===0,'result must remain manifold');assert(d.inconsistentWindingEdgeIds.length===0,'result winding must be consistent');assert(d.zeroAreaFaceIds.length===0,'result must not contain zero-area faces')}));
 results.push(await test('cut vertices respect width ratio along each source edge',()=>{const r=bevelTriCornerJunction(tetra(),edges,0.25);const p=r.mesh.vertices.find(v=>v.id.includes('_miter_b'))?.position;assert(!!p,'expected cut vertex toward b');assert(Math.abs(p![0]-0.5)<1e-9&&Math.abs(p![1]-0.5)<1e-9&&Math.abs(p![2]-1)<1e-9,'cut point should lie at 25% from junction to neighbor')}));
 results.push(await test('rejects invalid width without mutating input',()=>{const mesh=tetra(),before=JSON.stringify(mesh);let threw=false;try{bevelTriCornerJunction(mesh,edges,0.5)}catch{threw=true}assert(threw,'width 0.5 must reject');assert(JSON.stringify(mesh)===before,'rejected operation must not mutate source mesh')}));
 results.push(await test('rejects incomplete two-edge selection',()=>{let threw=false;try{bevelTriCornerJunction(tetra(),edges.slice(0,2),0.2)}catch{threw=true}assert(threw,'two-edge path must not enter tri-corner solver')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
