import { createViewportGestureState, gesturePointerDown, gesturePointerEnd, gesturePointerMove } from '../modes/animation/ViewportGestureState';
import { runAnimationGestureControllerTests } from './animationGestureControllerTests';

interface Result { name: string; passed: boolean; error?: string }
const assert=(c:unknown,m:string)=>{if(!c)throw new Error(m)};
const near=(a:number,b:number,e=1e-6)=>Math.abs(a-b)<=e;
const test=async(name:string,fn:()=>void|Promise<void>):Promise<Result>=>{try{await fn();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

export async function runAnimationGestureStateTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('single pointer produces incremental deltas',()=>{let s=createViewportGestureState();s=gesturePointerDown(s,1,{x:10,y:20}).state;const u=gesturePointerMove(s,1,{x:16,y:11});assert(u.state.mode==='SINGLE','single mode expected');assert(u.singleDelta?.x===6&&u.singleDelta?.y===-9,'incremental delta mismatch')}));
 results.push(await test('second pointer enters multi mode without inheriting single drag delta',()=>{let s=createViewportGestureState();s=gesturePointerDown(s,1,{x:0,y:0}).state;const u=gesturePointerDown(s,2,{x:100,y:0});assert(u.enteredMulti&&u.state.mode==='MULTI','must enter multi mode');assert(!u.singleDelta,'single delta must be cleared')}));
 results.push(await test('pinch scale and center pan are deterministic',()=>{let s=createViewportGestureState();s=gesturePointerDown(s,1,{x:0,y:0}).state;s=gesturePointerDown(s,2,{x:100,y:0}).state;const u=gesturePointerMove(s,2,{x:120,y:20});assert(u.multi,'multi output missing');assert(near(u.multi!.scale,100/Math.hypot(120,20)),'pinch scale mismatch');assert(near(u.multi!.pan.x,10)&&near(u.multi!.pan.y,10),'center pan mismatch')}));
 results.push(await test('two fingers to one finger rebases remaining pointer and prevents camera jump',()=>{let s=createViewportGestureState();s=gesturePointerDown(s,1,{x:0,y:0}).state;s=gesturePointerDown(s,2,{x:100,y:0}).state;s=gesturePointerMove(s,1,{x:10,y:5}).state;const end=gesturePointerEnd(s,2);assert(end.exitedMulti&&end.state.mode==='SINGLE','must rebase to single');const u=gesturePointerMove(end.state,1,{x:12,y:8});assert(u.singleDelta?.x===2&&u.singleDelta?.y===3,'remaining pointer must continue from rebased position')}));
 results.push(await test('ending final pointer returns a clean idle state',()=>{let s=createViewportGestureState();s=gesturePointerDown(s,7,{x:1,y:2}).state;s=gesturePointerEnd(s,7).state;assert(s.mode==='IDLE'&&s.pointers.size===0&&!s.primaryId,'idle state must be clean')}));
 results.push(await test('non-finite pointer coordinates are rejected',()=>{let rejected=false;try{gesturePointerDown(createViewportGestureState(),1,{x:Number.NaN,y:0})}catch{rejected=true}assert(rejected,'invalid gesture point must reject')}));
 for(const r of results)console.log(`${r.passed?'✓':'✗'} [${r.passed?'PASS':'FAIL'}] ${r.name}${r.error?` — ${r.error}`:''}`);
 const controller=await runAnimationGestureControllerTests();
 return{passed:results.filter(r=>r.passed).length+controller.passed,total:results.length+controller.total};
}
