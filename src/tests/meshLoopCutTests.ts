import type { MioMeshData } from '../types/creative';
import { canonicalMeshEdgeId, createCubeMesh, deriveMeshEdges, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { loopCutMesh } from '../modes/studio3d/modeling/MeshLoopCut';

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

export async function runMeshLoopCutTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('two-quad open strip loop cut creates three vertices and four quads',()=>{const r=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);assert(r.newVertexIds.length===3,'three ring edges should create three cut vertices');assert(r.mesh.vertices.length===9,'plane should gain three vertices');assert(r.mesh.faces.length===4,'two quads should split into four faces');assert(r.newFaceIds.length===2,'one new face per traversed quad');assert(validateMeshTopology(r.mesh).valid,'loop cut result must remain valid')})); 
 results.push(await test('ratio orientation stays consistent across the open strip',()=>{const r=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.25);const ys=r.newVertexIds.map(id=>r.mesh.vertices.find(vertex=>vertex.id===id)!.position[1]);assert(Math.max(...ys)-Math.min(...ys)<1e-9,'all cut vertices should align at one strip-relative ratio')}));
 results.push(await test('closed cube loop cut creates one vertex per ring edge',()=>{const r=loopCutMesh(createCubeMesh(),canonicalMeshEdgeId('v0','v1'),0.5);assert(r.closed,'cube cut should use a closed ring');assert(r.ringEdgeIds.length===4,'cube ring should contain four edges');assert(r.newVertexIds.length===4,'one cut vertex per ring edge');assert(r.cutFaceIds.length===4,'four cube side faces should be cut');assert(r.mesh.faces.length===10,'four faces split into eight while two untouched faces remain');assert(validateMeshTopology(r.mesh).valid,'closed loop cut must remain valid')}));
 results.push(await test('loop cut creates connecting cut edges between inserted ring vertices',()=>{const r=loopCutMesh(twoQuadPlane(),canonicalMeshEdgeId('v1','v4'),0.5);const cutSet=new Set(r.newVertexIds);const connecting=deriveMeshEdges(r.mesh).filter(edge=>edge.vertexIds.every(id=>cutSet.has(id)));assert(connecting.length===2,'two cut segments should connect the three inserted vertices')}));
 results.push(await test('loop cut rejects non-quad traversal',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]}],faces:[{id:'tri',vertexIds:['a','b','c']}]};let threw=false;try{loopCutMesh(mesh,canonicalMeshEdgeId('a','b'),0.5)}catch{threw=true}assert(threw,'triangle traversal must be rejected')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
