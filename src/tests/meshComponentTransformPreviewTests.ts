import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { applyComponentGizmoPreview, identityComponentGizmoPose } from '../modes/studio3d/modeling/MeshComponentTransformPreview';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

export async function runMeshComponentTransformPreviewTests():Promise<{passed:number;total:number}>{
  const results:Result[]=[];
  const mesh=createCubeMesh();
  const selection={mode:'vertex' as const,vertexIds:['v0'],edgeIds:[],faceIds:[]};
  const pivot:[number,number,number]=[-0.5,-0.5,-0.5];
  results.push(await test('identity pose preserves component mesh',()=>{const next=applyComponentGizmoPreview(mesh,selection,'move',pivot,identityComponentGizmoPose(pivot));assert(JSON.stringify(next)===JSON.stringify(mesh),'identity move must preserve mesh')}));
  results.push(await test('component move uses proxy position relative to pivot',()=>{const pose=identityComponentGizmoPose(pivot);pose.position=[0.5,-0.5,-0.5];const next=applyComponentGizmoPreview(mesh,selection,'move',pivot,pose);assert(next.vertices.find(v=>v.id==='v0')?.position[0]===0.5,'vertex should move +1 on X')}));
  results.push(await test('component scale is pivot centered',()=>{const selection2={mode:'vertex' as const,vertexIds:['v0','v1'],edgeIds:[],faceIds:[]};const p:[number,number,number]=[0,-0.5,-0.5];const pose=identityComponentGizmoPose(p);pose.scale=[2,1,1];const next=applyComponentGizmoPreview(mesh,selection2,'scale',p,pose);assert(next.vertices.find(v=>v.id==='v0')?.position[0]===-1,'left vertex should scale around centroid')}));
  for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
  return{passed:results.filter(item=>item.passed).length,total:results.length};
}
