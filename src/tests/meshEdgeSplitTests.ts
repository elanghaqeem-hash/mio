import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, deriveMeshEdges, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { splitMeshEdge } from '../modes/studio3d/modeling/MeshEdgeSplit';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshEdgeSplitTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('manifold cube edge split inserts one shared midpoint vertex',()=>{const mesh=createCubeMesh();const edgeId=canonicalMeshEdgeId('v0','v1');const r=splitMeshEdge(mesh,edgeId,0.5);assert(r.mesh.vertices.length===9,'cube should gain one vertex');const v=r.mesh.vertices.find(vertex=>vertex.id===r.newVertexId);assert(v?.position[0]===0&&v.position[1]===-0.5&&v.position[2]===-0.5,'midpoint position should be exact');assert(r.updatedFaceIds.length===2,'two incident cube faces should update');assert(validateMeshTopology(r.mesh).valid,'result must remain valid');const replacementEdges=deriveMeshEdges(r.mesh).filter(edge=>edge.vertexIds.includes(r.newVertexId));assert(replacementEdges.length>=2,'new vertex must participate in replacement edges')}));
 results.push(await test('split ratio is respected',()=>{const r=splitMeshEdge(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.25);const v=r.mesh.vertices.find(vertex=>vertex.id===r.newVertexId);assert(v?.position[0]===-0.25,'quarter split should place vertex at x -0.25')}));
 results.push(await test('edge split preserves face winding order around insertion',()=>{const mesh=createCubeMesh();const r=splitMeshEdge(mesh,canonicalMeshEdgeId('v0','v1'),0.5);const bottom=r.mesh.faces.find(face=>face.id==='f_bottom');const index=bottom?.vertexIds.indexOf('v0')??-1;assert(index>=0,'bottom face must contain v0');assert(bottom?.vertexIds[(index+1)%bottom.vertexIds.length]===r.newVertexId,'split vertex should follow v0 on bottom face');assert(bottom?.vertexIds[(index+2)%bottom.vertexIds.length]==='v1','v1 should follow split vertex')}));
 results.push(await test('ratio bounds are enforced',()=>{for(const ratio of [0,1,-0.1,1.1]){let threw=false;try{splitMeshEdge(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),ratio)}catch{threw=true}assert(threw,`ratio ${ratio} must throw`)}}));
 results.push(await test('non-manifold edge split is rejected',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]},{id:'d',position:[0,-1,0]},{id:'e',position:[0,0,1]}],faces:[{id:'f1',vertexIds:['a','b','c']},{id:'f2',vertexIds:['b','a','d']},{id:'f3',vertexIds:['a','b','e']}]};let threw=false;try{splitMeshEdge(mesh,canonicalMeshEdgeId('a','b'),0.5)}catch{threw=true}assert(threw,'non-manifold edge must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
