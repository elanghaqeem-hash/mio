import { alignGraphicLayers, beginGraphicDrag, distributeGraphicLayers, graphicToMotionProject, hitTestGraphicLayers, nudgeGraphicLayers, snapGraphicPosition, toggleGraphicSelection, updateGraphicDrag, beginGraphicPenPath, appendGraphicPenPoint, finishGraphicPenPath } from '../creative/GraphicMotionWorkspace';
import type { MioGraphicDocument } from '../types/creative';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message);};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true};}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

const document:MioGraphicDocument={width:600,height:400,backgroundColor:'#000',layers:[
 {id:'a',name:'A',type:'shape',shapeType:'rectangle',visible:true,locked:false,opacity:1,x:13,y:20,width:100,height:50,fill:'#fff'},
 {id:'b',name:'B',type:'text',visible:true,locked:false,opacity:.8,x:240,y:80,width:120,height:40,fill:'#eee',text:'Mio',fontSize:24},
 {id:'c',name:'C',type:'shape',shapeType:'circle',visible:true,locked:false,opacity:1,x:480,y:140,width:60,height:60,fill:'#0ff'},
]};

export async function runGraphicMotionWorkspaceTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('graphic alignment is deterministic',()=>{const next=alignGraphicLayers(document,['a','b'],'left');assert(next.layers[0].x===next.layers[1].x,'left alignment failed');}));
 results.push(await test('graphic distribution preserves endpoints',()=>{const next=distributeGraphicLayers(document,['a','b','c'],'horizontal');assert(next.layers[0].x===13&&next.layers[2].x===480,'distribution moved endpoints');}));
 results.push(await test('graphic grid snapping is bounded to grid increments',()=>{assert(snapGraphicPosition(13,8)===16,'grid snap failed');assert(snapGraphicPosition(13,8,false)===13,'disabled snap changed value');}));
 results.push(await test('graphic to motion bridge keeps editable vector/text semantics',()=>{const motion=graphicToMotionProject(document,8,24);assert(motion.layers.length===3,'bridge dropped editable layers');assert(motion.layers[1].type==='text'&&motion.layers[1].text==='Mio','text semantics lost');assert(motion.duration===8&&motion.fps===24,'motion settings lost');}));
 results.push(await test('pointer hit testing respects visual z-order',()=>{const hits=hitTestGraphicLayers(document,{x:250,y:90});assert(hits[0]==='b','topmost hit was not returned first');}));
 results.push(await test('multi-selection toggles deterministically',()=>{assert(toggleGraphicSelection(['a'],'b',true).join(',')==='a,b','additive select failed');assert(toggleGraphicSelection(['a','b'],'a',true).join(',')==='b','toggle deselect failed');}));
 results.push(await test('drag transaction moves unlocked layers with grid snap',()=>{const session=beginGraphicDrag(document,['a','b'],{x:0,y:0},8,true);const next=updateGraphicDrag(document,session,{x:10,y:10});assert(next.layers[0].x===24&&next.layers[0].y===32,'snapped drag failed');}));
 results.push(await test('keyboard nudge protects locked layers',()=>{const locked={...document,layers:document.layers.map(l=>l.id==='b'?{...l,locked:true}:l)};const next=nudgeGraphicLayers(locked,['a','b'],2,-1);assert(next.layers[0].x===15&&next.layers[1].x===240,'nudge lock boundary failed');}));
 results.push(await test('pen lifecycle creates appends and finishes open path',()=>{const started=beginGraphicPenPath(document,{x:40,y:50},'pen_test');assert(started.layerId==='pen_test','pen layer id unstable');const appended=appendGraphicPenPoint(started.document,started.layerId,{x:80,y:90});const finished=finishGraphicPenPath(appended.document,started.layerId,false),layer=finished.layers.find(l=>l.id===started.layerId);assert(layer?.path?.points.length===2,'pen append failed');assert(layer?.path?.closed===false,'open finish closed path');}));
 results.push(await test('pen close requires at least three anchors',()=>{const started=beginGraphicPenPath(document,{x:10,y:10},'pen_close');const two=appendGraphicPenPoint(started.document,started.layerId,{x:20,y:20}).document;assert(finishGraphicPenPath(two,started.layerId,true).layers.at(-1)?.path?.closed===false,'two-point path closed');const three=appendGraphicPenPoint(two,started.layerId,{x:30,y:10}).document;assert(finishGraphicPenPath(three,started.layerId,true).layers.at(-1)?.path?.closed===true,'three-point path did not close');}));
 for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
 return {passed:results.filter(r=>r.passed).length,total:results.length};
}
