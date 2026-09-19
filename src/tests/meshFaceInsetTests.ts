import { createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { insetMeshFace } from '../modes/studio3d/modeling/MeshFaceInset';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshFaceInsetTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('quad inset creates four inner vertices and four ring faces',()=>{const r=insetMeshFace(createCubeMesh(),'f_front',0.25);assert(r.createdVertexIds.length===4,'expected four inset vertices');assert(r.createdRingFaceIds.length===4,'expected four ring faces');assert(r.mesh.vertices.length===12,'cube should gain four vertices');assert(r.mesh.faces.length===10,'cube should replace one face with inset+four ring faces');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('inset face preserves winding and remains coplanar',()=>{const r=insetMeshFace(createCubeMesh(),'f_front',0.5);const face=r.mesh.faces.find(item=>item.id===r.insetFaceId);const positions=face?.vertexIds.map(id=>r.mesh.vertices.find(v=>v.id===id)?.position);assert(positions?.every(position=>Math.abs((position?.[2]??0)-0.5)<1e-9),'inset must remain on source plane');assert(face?.vertexIds.length===4,'inner face should remain quad')}));
 results.push(await test('inset ratio bounds are enforced',()=>{for(const ratio of [0,1,-0.1,1.1]){let threw=false;try{insetMeshFace(createCubeMesh(),'f_front',ratio)}catch{threw=true}assert(threw,`ratio ${ratio} must throw`)}}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
