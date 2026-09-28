import { createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { deriveUVSeamEdgeIds, meshHasCompleteUVs, unwrapMeshCube, unwrapMeshPlanar } from '../modes/studio3d/modeling/MeshUV';
import { projectMeshToBufferGeometry } from '../modes/studio3d/modeling/MeshGeometryProjection';

interface R{name:string;passed:boolean;error?:string}
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<R>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

export async function runMeshUVTests(){const results:R[]=[];
results.push(await test('planar unwrap is deterministic complete and source immutable',()=>{const source=createCubeMesh(),before=JSON.stringify(source),first=unwrapMeshPlanar(source,'z'),second=unwrapMeshPlanar(source,'z');assert(meshHasCompleteUVs(first),'UVs complete');assert(JSON.stringify(first)===JSON.stringify(second),'deterministic');assert(JSON.stringify(source)===before,'source immutable');assert(first.faces.every(face=>face.uvs!.every(uv=>uv.every(value=>value>=0&&value<=1))),'UVs normalized')}));
results.push(await test('cube unwrap exposes seam contract and projects UV attribute',()=>{const mesh=unwrapMeshCube(createCubeMesh()),seams=deriveUVSeamEdgeIds(mesh),projection=projectMeshToBufferGeometry(mesh),position=projection.geometry.getAttribute('position'),uv=projection.geometry.getAttribute('uv');assert(meshHasCompleteUVs(mesh),'cube UV complete');assert(seams.length>0,'cube projection produces explicit UV seams');assert(Boolean(uv)&&uv.count===position.count,'projected UV count matches position count');projection.geometry.dispose()}));
results.push(await test('topology validation rejects malformed UV corner data',()=>{const mesh=createCubeMesh();mesh.faces[0].uvs=[[0,0]];const validation=validateMeshTopology(mesh);assert(!validation.valid&&validation.errors.some(error=>error.includes('UV count must match')),'UV length mismatch rejected');mesh.faces[0].uvs=mesh.faces[0].vertexIds.map(()=>[Number.NaN,0]);const invalid=validateMeshTopology(mesh);assert(!invalid.valid&&invalid.errors.some(error=>error.includes('non-finite UV')),'non-finite UV rejected')}));
for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
return{passed:results.filter(result=>result.passed).length,total:results.length};
}
