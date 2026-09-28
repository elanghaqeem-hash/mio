import type { MioMeshData } from '../types/creative';
import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { executeMeshBoolean } from '../modes/studio3d/modeling/MeshBoolean';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';

interface R{name:string;passed:boolean;error?:string}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<R>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
const translate=(mesh:MioMeshData,offset:[number,number,number]):MioMeshData=>({vertices:mesh.vertices.map(vertex=>({id:vertex.id,position:[vertex.position[0]+offset[0],vertex.position[1]+offset[1],vertex.position[2]+offset[2]]})),faces:mesh.faces.map(face=>structuredClone(face))});
const safe=(mesh:MioMeshData)=>{const d=diagnoseMeshTopology(mesh);return d.valid&&!d.boundaryEdgeIds.length&&!d.nonManifoldEdgeIds.length&&!d.zeroAreaFaceIds.length&&!d.inconsistentWindingEdgeIds.length&&!d.duplicateFaceGroups.length&&!d.isolatedVertexIds.length};

export async function runMeshBooleanTests(){const results:R[]=[];
results.push(await test('unions overlapping axis-aligned boxes deterministically',()=>{const a=createCubeMesh(),b=translate(createCubeMesh(),[0.5,0,0]),beforeA=JSON.stringify(a),beforeB=JSON.stringify(b);const first=executeMeshBoolean(a,b,'union'),second=executeMeshBoolean(a,b,'union');assert(first.vertices.length>8&&first.faces.length>6,'union creates combined boundary');assert(JSON.stringify(first)===JSON.stringify(second),'union deterministic');assert(safe(first),'union topology safe');assert(JSON.stringify(a)===beforeA&&JSON.stringify(b)===beforeB,'sources immutable')}));
results.push(await test('intersects overlapping boxes into shared volume',()=>{const result=executeMeshBoolean(createCubeMesh(),translate(createCubeMesh(),[0.5,0,0]),'intersection');assert(result.vertices.length===8&&result.faces.length===6,'intersection resolves to one box');const xs=result.vertices.map(vertex=>vertex.position[0]);assert(Math.min(...xs)===0&&Math.max(...xs)===0.5,'intersection bounds correct');assert(safe(result),'intersection topology safe')}));
results.push(await test('subtracts overlapping box into remaining volume',()=>{const result=executeMeshBoolean(createCubeMesh(),translate(createCubeMesh(),[0.5,0,0]),'difference');assert(result.vertices.length===8&&result.faces.length===6,'difference resolves to one box');const xs=result.vertices.map(vertex=>vertex.position[0]);assert(Math.min(...xs)===-0.5&&Math.max(...xs)===0,'difference bounds correct');assert(safe(result),'difference topology safe')}));
results.push(await test('returns empty mesh for disjoint intersection',()=>{const result=executeMeshBoolean(createCubeMesh(),translate(createCubeMesh(),[3,0,0]),'intersection');assert(result.vertices.length===0&&result.faces.length===0,'disjoint intersection empty')}));
results.push(await test('rejects unsupported non-box operand explicitly',()=>{const bad=createCubeMesh();bad.vertices[0].position[0]-=0.125;let threw=false;try{executeMeshBoolean(bad,createCubeMesh(),'union')}catch(error){threw=String(error).includes('axis-aligned box')}assert(threw,'unsupported operand rejected')}));
for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
return{passed:results.filter(result=>result.passed).length,total:results.length};
}
