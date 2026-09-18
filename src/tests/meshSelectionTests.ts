import { clearMeshSelection, toggleFaceSelection } from '../modes/studio3d/modeling/MeshSelection';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

export async function runMeshSelectionTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('single face click replaces selection',()=>{const next=toggleFaceSelection({mode:'face',vertexIds:[],edgeIds:[],faceIds:['a']},'b',false);assert(next.faceIds.join(',')==='b','single selection must replace prior face')}));
 results.push(await test('additive face click toggles membership',()=>{const initial={mode:'face' as const,vertexIds:[],edgeIds:[],faceIds:['a']};const added=toggleFaceSelection(initial,'b',true);assert(added.faceIds.join(',')==='a,b','shift click must add');const removed=toggleFaceSelection(added,'a',true);assert(removed.faceIds.join(',')==='b','shift click selected face must remove')}));
 results.push(await test('clear preserves component mode',()=>{const cleared=clearMeshSelection('edge');assert(cleared.mode==='edge'&&cleared.edgeIds.length===0,'clear should preserve mode')}));
 for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
 return{passed:results.filter((item)=>item.passed).length,total:results.length};
}
