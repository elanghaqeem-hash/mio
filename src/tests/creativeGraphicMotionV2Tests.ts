import { beginGraphicResize, deleteMotionKeyframe, graphicToMotionProject, moveMotionKeyframe, setMotionKeyframeInterpolation, updateGraphicResize, beginGraphicRotation, updateGraphicRotation, upsertMotionKeyframe } from '../creative/GraphicMotionWorkspace';
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
 for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
 return{passed:results.filter(result=>result.passed).length,total:results.length};
}
