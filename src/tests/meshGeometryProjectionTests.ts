import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { faceIdFromTriangleIndex, projectMeshToBufferGeometry, triangulateMeshFaces } from '../modes/studio3d/modeling/MeshGeometryProjection';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

export async function runMeshGeometryProjectionTests():Promise<{passed:number;total:number}>{
  const results:Result[]=[];
  results.push(await test('quad cube topology triangulates deterministically',()=>{
    const triangles=triangulateMeshFaces(createCubeMesh());
    assert(triangles.length===12,'six quads should project to twelve triangles');
    assert(triangles[0].faceId==='f_back','triangle ordering should preserve face ordering');
    assert(triangles[0].vertexIds.join(',')==='v0,v3,v2','fan triangulation should be deterministic');
  }));
  results.push(await test('buffer geometry preserves triangle to face picking map',()=>{
    const projection=projectMeshToBufferGeometry(createCubeMesh());
    const position=projection.geometry.getAttribute('position');
    assert(position.count===36,'twelve triangles should expose thirty-six projected vertices');
    assert(faceIdFromTriangleIndex(projection,0)==='f_back','first triangle should map to back face');
    assert(faceIdFromTriangleIndex(projection,1)==='f_back','second triangle should map to back face');
    assert(faceIdFromTriangleIndex(projection,2)==='f_front','third triangle should map to front face');
    projection.geometry.dispose();
  }));
  for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
  return{passed:results.filter((item)=>item.passed).length,total:results.length};
}
