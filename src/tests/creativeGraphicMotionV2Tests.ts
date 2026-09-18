import { beginGraphicResize, deleteMotionKeyframe, graphicToMotionProject, moveMotionKeyframe, setMotionKeyframeInterpolation, updateGraphicResize, beginGraphicRotation, updateGraphicRotation, hitTestGraphicLayers, getGraphicSelectionBounds, beginGraphicGroupResize, updateGraphicGroupResize, snapGraphicPointToSmartGuides, snapGraphicDragToSmartGuides, beginGraphicDrag, upsertMotionKeyframe } from '../creative/GraphicMotionWorkspace';
import type { MioGraphicDocument } from '../types/creative';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};

const graphic=():MioGraphicDocument=>({width:800,height:600,backgroundColor:'#000',layers:[
  {id:'card',name:'Card',type:'shape',shapeType:'rectangle',visible:true,locked:false,opacity:1,x:100,y:100,width:200,height:100,fill:'#fff'},
  {id:'title',name:'Title',type:'text',visible:true,locked:false,opacity:1,x:120,y:130,width:160,height:40,text:'Mio',fontSize:24,fill:'#000'}
]});

export async function runCreativeGraphicMotionV2Tests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('Graphic resize supports proportional transform',()=>{
   const doc=graphic(),session=beginGraphicResize(doc,'card','se',{x:300,y:200}); assert(session,'resize session missing');
   const resized=updateGraphicResize(doc,session!,{x:400,y:250},true); const layer=resized.layers[0];
   assert(layer.width===300&&layer.height===150,'proportional resize incorrect');
 }));
 results.push(await test('Graphic resize follows rotated local axes',()=>{
   const doc={...graphic(),layers:graphic().layers.map(layer=>layer.id==='card'?{...layer,rotation:90}:layer)}; const session=beginGraphicResize(doc,'card','e',{x:200,y:0}); assert(session,'rotated resize session missing');
   const resized=updateGraphicResize(doc,session!,{x:200,y:50}); const layer=resized.layers[0]; assert(layer.width>200,'world vertical drag should grow 90-degree layer local width'); assert(layer.rotation===90,'resize must preserve rotation');
 }));
 results.push(await test('Graphic handoff creates editable motion layers',()=>{
   const motion=graphicToMotionProject(graphic(),8,24); assert(motion.layers.length===2,'layer handoff incomplete'); assert(motion.duration===8&&motion.fps===24,'motion settings incorrect');
 }));
 results.push(await test('Motion keyframes support deterministic edit lifecycle',()=>{
   let motion=graphicToMotionProject(graphic(),6,30); const node=motion.layers[0].id;
   motion=upsertMotionKeyframe(motion,node,'x',1.237,250,'linear'); const track=motion.tracks[0], key=track.keyframes[0];
   assert(key.time===1.233,'keyframe did not snap to FPS'); motion=moveMotionKeyframe(motion,track.id,key.id,2.02);
   assert(motion.tracks[0].keyframes[0].time===2.033,'keyframe move did not snap'); motion=setMotionKeyframeInterpolation(motion,track.id,key.id,'easeOut');
   assert(motion.tracks[0].keyframes[0].interpolation==='easeOut','interpolation edit failed'); motion=deleteMotionKeyframe(motion,track.id,key.id); assert(motion.tracks.length===0,'keyframe delete failed');
 }));
 results.push(await test('Graphic group transforms preserve lock rotation and aspect invariants',()=>{
   const base=graphic(); const multi={...base,layers:[...base.layers,{...base.layers[0],id:'card2',x:420,y:180,rotation:0}]};
   const locked={...multi,layers:multi.layers.map(layer=>layer.id==='card2'?{...layer,locked:true}:layer)};
   assert(beginGraphicGroupResize(locked,['card','card2'])===null,'group resize should reject fewer than two unlocked members');
   const rotated={...multi,layers:multi.layers.map(layer=>layer.id==='card'?{...layer,rotation:37}:layer)}; const session=beginGraphicGroupResize(rotated,['card','card2'],'se'); assert(session,'rotated group session missing');
   const resized=updateGraphicGroupResize(rotated,session!,{x:session!.bounds.right+40,y:session!.bounds.bottom+20}); assert(resized.layers.find(layer=>layer.id==='card')?.rotation===37,'member rotation changed during group resize');
   const aspect=beginGraphicGroupResize(multi,['card','card2'],'se'); assert(aspect,'aspect session missing'); const aspectResult=updateGraphicGroupResize(multi,aspect!,{x:aspect!.bounds.right+80,y:aspect!.bounds.bottom+10},true); const bounds=getGraphicSelectionBounds(aspectResult,['card','card2']);
   assert(bounds&&Math.abs(bounds.width/bounds.height-aspect!.bounds.width/aspect!.bounds.height)<0.05,'aspect ratio drifted during Shift group resize');
 }));
 results.push(await test('Graphic smart guides snap moving selection geometry rather than pointer',()=>{
   const doc=graphic(); const session=beginGraphicDrag(doc,['card'],{x:150,y:150},8,false); const snapped=snapGraphicDragToSmartGuides(doc,session,{x:350,y:150},6);
   assert(snapped.pointer.x===350,'pointer should remain stable when selection center is already aligned'); assert(snapped.guides.some(guide=>guide.axis==='x'&&guide.value===400),'canvas center guide missing');
   const near=snapGraphicDragToSmartGuides(doc,session,{x:347,y:150},6); assert(near.pointer.x===350,'selection-aware snap should correct pointer by nearest geometry delta');
 }));
 for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
 return{passed:results.filter(result=>result.passed).length,total:results.length};
}
