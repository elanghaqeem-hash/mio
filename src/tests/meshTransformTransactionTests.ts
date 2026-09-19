import { createCubeMesh } from '../modes/studio3d/modeling/MeshTopology';
import { createMeshTransformTransaction, meshSelectionPivot } from '../modes/studio3d/modeling/MeshTransformTransaction';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
export async function runMeshTransformTransactionTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];const mesh=createCubeMesh();const selection={mode:'vertex' as const,vertexIds:['v0','v1'],edgeIds:[],faceIds:[]};
 results.push(await test('transaction preview is repeatable from original snapshot',()=>{const tx=createMeshTransformTransaction(mesh,selection);const a=tx.preview([1,0,0]);const b=tx.preview([1,0,0]);assert(JSON.stringify(a)===JSON.stringify(b),'preview must not accumulate delta')})); 
 results.push(await test('cancel returns original mesh',()=>{const tx=createMeshTransformTransaction(mesh,selection);tx.preview([2,2,2]);assert(JSON.stringify(tx.cancel())===JSON.stringify(mesh),'cancel must restore exact original')})); 
 results.push(await test('selection pivot is centroid of selected vertices',()=>{const p=meshSelectionPivot(mesh,selection);assert(!!p&&p[0]===0&&p[1]===-0.5&&p[2]===-0.5,'pivot should equal selected centroid')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
