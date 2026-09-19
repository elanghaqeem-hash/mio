import { PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial, Vector2, Vector3 } from 'three';
import { createCubeMesh, deriveMeshEdges } from '../modes/studio3d/modeling/MeshTopology';
import { pickMeshEdgeScreenSpace, pickMeshVertexScreenSpace } from '../modes/studio3d/modeling/MeshComponentPicking';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
export async function runMeshComponentPickingTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[]; const camera=new PerspectiveCamera(50,1,0.1,100);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 const object=new Mesh(new BoxGeometry(),new MeshBasicMaterial());object.updateMatrixWorld();
 const mesh=createCubeMesh();
 results.push(await test('vertex screen picker resolves projected cube corner',()=>{const projected=new Vector3(...mesh.vertices[0].position).project(camera);const target=new Vector2((projected.x+1)*500,(1-projected.y)*500);const picked=pickMeshVertexScreenSpace(mesh,object,camera,target,1000,1000,12);assert(!!picked,'expected nearby vertex')}));
 results.push(await test('vertex picker rejects distant pointer',()=>assert(pickMeshVertexScreenSpace(mesh,object,camera,new Vector2(0,0),1000,1000,5)===null,'distant pointer must miss')));
 results.push(await test('edge picker resolves a projected edge vicinity',()=>{const edge=deriveMeshEdges(mesh)[0];const a=mesh.vertices.find(v=>v.id===edge.vertexIds[0])!;const b=mesh.vertices.find(v=>v.id===edge.vertexIds[1])!;const pa=new Vector3(...a.position).project(camera);const pb=new Vector3(...b.position).project(camera);const target=new Vector2(((pa.x+pb.x)/2+1)*500,(1-(pa.y+pb.y)/2)*500);const picked=pickMeshEdgeScreenSpace(mesh,object,camera,target,1000,1000,12);assert(!!picked,'expected nearby edge')}));
 object.geometry.dispose();(object.material as MeshBasicMaterial).dispose();
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
