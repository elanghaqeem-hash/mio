import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { rotateMeshSelection, scaleMeshSelection } from '../modes/studio3d/modeling/MeshTransformOperations';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
export async function runMeshTransformOperationTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];const mesh=createCubeMesh();const selection={mode:'vertex' as const,vertexIds:['v0','v1'],edgeIds:[],faceIds:[]};
 results.push(await test('selection rotation keeps pivot fixed',()=>{const next=rotateMeshSelection(mesh,selection,[0,Math.PI/2,0]);const p=next.vertices.find(v=>v.id==='v0')?.position;assert(!!p&&Math.abs(p[0]-0)<1e-6&&Math.abs(p[2]-0)<1e-6,'rotation should occur around selection pivot')}));
 results.push(await test('selection scale keeps pivot fixed',()=>{const next=scaleMeshSelection(mesh,selection,[2,1,1]);const p=next.vertices.find(v=>v.id==='v0')?.position;assert(!!p&&p[0]===-1&&p[1]===-0.5,'pivot-centered scaling should preserve pivot-axis coordinates')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
