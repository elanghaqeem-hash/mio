import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import { bevelMultiPoleJunction } from '../modes/studio3d/modeling/MeshMultiPoleMiter';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
const pyramid=():MioMeshData=>({vertices:[{id:'top',position:[0,0,1]},{id:'a',position:[-1,-1,0]},{id:'b',position:[1,-1,0]},{id:'c',position:[1,1,0]},{id:'d',position:[-1,1,0]}],faces:[{id:'side_ab',vertexIds:['top','a','b']},{id:'side_bc',vertexIds:['top','b','c']},{id:'side_cd',vertexIds:['top','c','d']},{id:'side_da',vertexIds:['top','d','a']},{id:'base',vertexIds:['a','d','c','b']}]});
const edges=['a','b','c','d'].map(id=>canonicalMeshEdgeId('top',id));

export async function runMeshMultiPoleMiterTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('bevels a valence-4 pyramid pole into a watertight quad miter',()=>{const r=bevelMultiPoleJunction(pyramid(),edges,0.2);assert(r.poleDegree===4,'pole degree should be four');assert(r.createdVertexIds.length===4,'four cut vertices expected');assert(r.miterFaceIds.length===1,'one cap expected');assert(!r.mesh.vertices.some(v=>v.id==='top'),'source pole should be removed');assert(r.mesh.faces.length===6,'four side faces, base, and miter cap expected');assert(validateMeshTopology(r.mesh).valid,'result topology must validate');const d=diagnoseMeshTopology(r.mesh);assert(d.boundaryEdgeIds.length===0,'result must remain watertight');assert(d.nonManifoldEdgeIds.length===0,'result must remain manifold');assert(d.inconsistentWindingEdgeIds.length===0,'winding must remain consistent');assert(d.zeroAreaFaceIds.length===0,'no zero-area faces allowed')}));
 results.push(await test('preserves source mesh when invalid width is rejected',()=>{const mesh=pyramid(),before=JSON.stringify(mesh);let threw=false;try{bevelMultiPoleJunction(mesh,edges,0.5)}catch{threw=true}assert(threw,'invalid width must reject');assert(JSON.stringify(mesh)===before,'source mesh must not mutate')}));
 results.push(await test('rejects incomplete valence-4 pole selection',()=>{let threw=false;try{bevelMultiPoleJunction(pyramid(),edges.slice(0,3),0.2)}catch{threw=true}assert(threw,'incomplete pole must reject')}));
 results.push(await test('rejects material-boundary fan',()=>{const mesh=pyramid();mesh.faces.find(f=>f.id==='side_bc')!.materialSlot=2;let threw=false;try{bevelMultiPoleJunction(mesh,edges,0.2)}catch{threw=true}assert(threw,'material-boundary fan must reject')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
