import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { splitMeshEdge } from '../modes/studio3d/modeling/MeshEdgeSplit';
import { dissolveValence2Vertex } from '../modes/studio3d/modeling/MeshVertexDissolve';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshVertexDissolveTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('dissolve reverses an internal cube edge split',()=>{const original=createCubeMesh();const split=splitMeshEdge(original,canonicalMeshEdgeId('v0','v1'),0.5);const dissolved=dissolveValence2Vertex(split.mesh,split.newVertexId);assert(dissolved.restoredEdgeId===canonicalMeshEdgeId('v0','v1'),'original edge should be restored');assert(dissolved.mesh.vertices.length===original.vertices.length,'vertex count should return to original');assert(dissolved.mesh.faces.length===original.faces.length,'face count should remain original');for(const face of original.faces){const restored=dissolved.mesh.faces.find(item=>item.id===face.id);assert(JSON.stringify(restored?.vertexIds)===JSON.stringify(face.vertexIds),`face ${face.id} winding/order should be restored`)}assert(validateMeshTopology(dissolved.mesh).valid,'restored cube must be valid')}));
 results.push(await test('dissolve reverses a boundary edge split',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[1,1,0]},{id:'d',position:[0,1,0]}],faces:[{id:'quad',vertexIds:['a','b','c','d']}]};const split=splitMeshEdge(mesh,canonicalMeshEdgeId('a','b'),0.25);const dissolved=dissolveValence2Vertex(split.mesh,split.newVertexId);assert(dissolved.mesh.vertices.length===4,'boundary split vertex should be removed');assert(JSON.stringify(dissolved.mesh.faces[0].vertexIds)===JSON.stringify(mesh.faces[0].vertexIds),'quad order should be restored')}));
 results.push(await test('original cube corner is rejected because valence is not two',()=>{let threw=false;try{dissolveValence2Vertex(createCubeMesh(),'v0')}catch{threw=true}assert(threw,'cube corner dissolve must be rejected')}));
 results.push(await test('missing vertex is rejected',()=>{let threw=false;try{dissolveValence2Vertex(createCubeMesh(),'missing')}catch{threw=true}assert(threw,'missing vertex must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
