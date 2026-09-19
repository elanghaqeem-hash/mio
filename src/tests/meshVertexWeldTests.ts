import type { MioMeshData } from '../types/creative';
import { createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { weldMeshVertices } from '../modes/studio3d/modeling/MeshVertexWeld';

interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};

export async function runMeshVertexWeldTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('adjacent cube vertices weld to deterministic survivor',()=>{const r=weldMeshVertices(createCubeMesh(),['v1','v0']);assert(r.survivorVertexId==='v0','lexical survivor expected');assert(r.mesh.vertices.length===7,'one vertex should be removed');const survivor=r.mesh.vertices.find(v=>v.id==='v0');assert(survivor?.position[0]===0&&survivor.position[1]===-0.5&&survivor.position[2]===-0.5,'survivor should move to average');assert(validateMeshTopology(r.mesh).valid,'weld result must remain valid')}));
 results.push(await test('weld compacts affected polygon references',()=>{const r=weldMeshVertices(createCubeMesh(),['v0','v1']);const back=r.mesh.faces.find(face=>face.id==='f_back');assert(back?.vertexIds.length===3,'back quad should compact to triangle');assert(new Set(back?.vertexIds).size===back?.vertexIds.length,'face must not contain duplicate vertex IDs')}));
 results.push(await test('fully collapsed face is removed',()=>{const mesh:MioMeshData={vertices:[{id:'a',position:[0,0,0]},{id:'b',position:[1,0,0]},{id:'c',position:[0,1,0]}],faces:[{id:'tri',vertexIds:['a','b','c']}]};const r=weldMeshVertices(mesh,['a','b','c']);assert(r.mesh.faces.length===0,'collapsed face should be removed');assert(r.removedFaceIds.includes('tri'),'removed face should be reported');assert(r.mesh.vertices.length===1,'only survivor should remain');assert(validateMeshTopology(r.mesh).valid,'result must remain valid')}));
 results.push(await test('weld rejects missing vertex IDs',()=>{let threw=false;try{weldMeshVertices(createCubeMesh(),['v0','missing'])}catch{threw=true}assert(threw,'missing vertex must throw')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
