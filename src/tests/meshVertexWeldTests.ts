import type { MioMeshData } from '../types/creative';
import { createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { weldMeshVertices, weldMeshVerticesByDistance } from '../modes/studio3d/modeling/MeshVertexWeld';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshVertexWeldTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('adjacent cube vertices weld to deterministic survivor',()=>{const r=weldMeshVertices(createCubeMesh(),['v1','v0']);assert(r.survivorVertexId==='v0','lexical survivor expected');assert(r.mesh.vertices.length===7,'one vertex should be removed');const survivor=r.mesh.vertices.find(v=>v.id==='v0');assert(survivor?.position[0]===0&&survivor.position[1]===-0.5&&survivor.position[2]===-0.5,'survivor should move to average');assert(validateMeshTopology(r.mesh).valid,'weld result must remain valid')}));
 results.push(await test('weld compacts affected polygon references',()=>{const r=weldMeshVertices(createCubeMesh(),['v0','v1']);const back=r.mesh.faces.find(face=>face.id==='f_back');assert(back?.vertexIds.length===3,'back quad should compact to triangle');assert(new Set(back?.vertexIds).size===back?.vertexIds.length,'face must not contain duplicate vertex IDs')}));
 results.push(await test('fully collapsed face is removed',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]}],faces:[{id:'tri',vertexIds:['a','b','c']}]};const r=weldMeshVertices(mesh,['a','b','c']);assert(r.mesh.faces.length===0,'collapsed face should be removed');assert(r.removedFaceIds.includes('tri'),'removed face should be reported');assert(r.mesh.vertices.length===1,'only survivor should remain');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('weld-by-distance creates transitive deterministic groups',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[0.04,0,0]},{id:'c',position:[0.08,0,0]},{id:'d',position:[1,0,0]}],faces:[]};const r=weldMeshVerticesByDistance(mesh,0.05);assert(r.weldedGroups.length===1,'a-b-c should form one transitive cluster');assert(JSON.stringify(r.weldedGroups[0])===JSON.stringify(['a','b','c']),'cluster should be stable and sorted');assert(r.mesh.vertices.length===2,'three close vertices should become one plus distant vertex');assert(r.survivorVertexIds[0]==='a','lexical survivor expected')}));
 results.push(await test('weld-by-distance preserves mesh when no candidates are near',()=>{const mesh=createCubeMesh();const r=weldMeshVerticesByDistance(mesh,0.01,['v0','v1']);assert(r.weldedGroups.length===0,'distant vertices should not weld');assert(JSON.stringify(r.mesh)===JSON.stringify(mesh),'mesh should remain unchanged')}));
 results.push(await test('weld rejects missing vertex IDs',()=>{let threw=false;try{weldMeshVertices(createCubeMesh(),['v0','missing'])}catch{threw=true}assert(threw,'missing vertex must throw')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
