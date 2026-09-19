import { MotionCommandBus } from "../creative/motion/commands";
import { deleteMotionKeyframeCommand, moveMotionKeyframesCommand, moveMotionKeyframeCommand, setMotionKeyframeInterpolationCommand, timelineTransaction, updateMotionTransformDefaultsCommand, upsertMotionKeyframeCommand } from "../creative/motion/timelineCommands";
import type { MotionDocument } from "../creative/motion/model";

const assert=(ok:unknown,msg:string)=>{if(!ok)throw new Error(`Motion keyframe command test failed: ${msg}`)};
const doc=():MotionDocument=>({schemaVersion:1,id:"doc",activeCompositionId:"comp",compositions:[{id:"comp",name:"Comp",width:1920,height:1080,fps:30,durationFrames:60,workArea:[0,59],layers:[{id:"layer",name:"Layer",type:"shape",inFrame:0,outFrame:59,enabled:true,transform:{
position:{id:"position",property:"position",defaultValue:[0,0],keyframes:[{id:"p1",frame:10,value:[0,0],interpolation:{type:"linear"}},{id:"p2",frame:20,value:[100,100],interpolation:{type:"linear"}}]},
scale:{id:"scale",property:"scale",defaultValue:[100,100],keyframes:[]},rotation:{id:"rotation",property:"rotation",defaultValue:0,keyframes:[]},opacity:{id:"opacity",property:"opacity",defaultValue:100,keyframes:[]}
}}]}]});
export function runMotionKeyframeCommandTests():void{
 const bus=new MotionCommandBus(doc());
 bus.execute(timelineTransaction("keys","Keyframe edit",[
  moveMotionKeyframeCommand("comp","layer","position","p1",15),
  setMotionKeyframeInterpolationCommand("comp","layer","position","p1",{type:"bezier",out:[.42,0],in:[.58,1]}),
 ]));
 let track=bus.document.compositions[0].layers[0].transform.position;
 assert(track.keyframes[0].frame===15,"move keyframe");
 assert(track.keyframes[0].interpolation.type==="bezier","interpolation command");
 bus.execute(timelineTransaction("group","Group move",[
  moveMotionKeyframesCommand("comp","layer","position",["p1","p2"],5,60),
 ]));
 track=bus.document.compositions[0].layers[0].transform.position;
 assert(track.keyframes.map(k=>k.frame).join(",")==="20,25","group movement");
  bus.execute(timelineTransaction("transform","Transform defaults",[updateMotionTransformDefaultsCommand("comp","layer",{position:[300,400],scale:[150,150],rotation:25,opacity:80})]));
  const transformed=bus.document.compositions[0].layers[0].transform;
  assert(transformed.position.defaultValue[0]===300 && transformed.position.defaultValue[1]===400,"position default");
  assert(transformed.scale.defaultValue[0]===150 && transformed.rotation.defaultValue===25 && transformed.opacity.defaultValue===80,"transform defaults");
 bus.execute(timelineTransaction("upsert","Upsert",[
  upsertMotionKeyframeCommand("comp","layer","position",{id:"p3",frame:30,value:[200,200],interpolation:{type:"linear"}}),
 ]));
 assert(bus.document.compositions[0].layers[0].transform.position.keyframes.length===3,"upsert keyframe");
 bus.execute(timelineTransaction("delete","Delete",[
  deleteMotionKeyframeCommand("comp","layer","position","p3"),
 ]));
 assert(bus.document.compositions[0].layers[0].transform.position.keyframes.length===2,"delete keyframe");
 bus.undo(); assert(bus.document.compositions[0].layers[0].transform.position.keyframes.length===3,"undo delete");
 bus.undo(); assert(bus.document.compositions[0].layers[0].transform.position.keyframes.map(k=>k.frame).join(",")==="15,20","undo group move");
}
