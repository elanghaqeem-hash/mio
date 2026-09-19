import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { applyMeshTransformDelta, createMeshTransformState } from '../modes/studio3d/modeling/MeshTransformController';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
export async function runMeshTransformControllerTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];const mesh=createCubeMesh();const selection={mode:'vertex' as const,vertexIds:['v0','v1'],edgeIds:[],faceIds:[]};
 const run=async(name:string,fn:()=>void)=>{try{fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:String(e)})}};
 await run('axis constraint limits translation',()=>{const s=createMeshTransformState(mesh,selection);s.axis='x';const n=applyMeshTransformDelta(mesh,selection,s,[1,2,3]);const p=n.vertices.find(v=>v.id==='v0')!.position;assert(p[0]===0.5&&p[1]===-0.5&&p[2]===-0.5,'only X should move')});
 await run('inactive transform is identity',()=>{const s=createMeshTransformState(mesh,{mode:'vertex',vertexIds:[],edgeIds:[],faceIds:[]});assert(JSON.stringify(applyMeshTransformDelta(mesh,selection,s,[1,1,1]))===JSON.stringify(mesh),'inactive state must not mutate')});
 await run('pivot is stable',()=>{const s=createMeshTransformState(mesh,selection,'rotate');assert(s.pivot[0]===0&&s.pivot[1]===-0.5&&s.pivot[2]===-0.5,'pivot mismatch')});
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?' — '+r.error:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
