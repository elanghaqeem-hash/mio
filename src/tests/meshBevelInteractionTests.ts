import { beginBevelWidthDrag, bevelSegmentsFromWheel, bevelWidthFromPointer } from '../modes/studio3d/modeling/MeshBevelInteraction';
interface Result{name:string;passed:boolean;error?:string}
const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(e){return{name,passed:false,error:e instanceof Error?e.message:String(e)}}};
export async function runMeshBevelInteractionTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('pointer delta maps from immutable drag start width',()=>{const state=beginBevelWidthDrag(100,0.1,0.001);assert(Math.abs(bevelWidthFromPointer(state,150)-0.15)<1e-9,'50px should add 0.05');assert(Math.abs(bevelWidthFromPointer(state,120)-0.12)<1e-9,'later preview derives from start, not prior result')}));
 results.push(await test('bevel width drag clamps to safe range',()=>{const state=beginBevelWidthDrag(100,0.1,0.01);assert(bevelWidthFromPointer(state,-100)===0.01,'lower clamp');assert(bevelWidthFromPointer(state,1000)===0.49,'upper clamp')}));
 results.push(await test('wheel adjusts segments within 1..16',()=>{assert(bevelSegmentsFromWheel(4,-1)===5,'wheel up increments');assert(bevelSegmentsFromWheel(4,1)===3,'wheel down decrements');assert(bevelSegmentsFromWheel(1,1)===1,'lower bound');assert(bevelSegmentsFromWheel(16,-1)===16,'upper bound')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
