import { stepMotionPlayback } from "../creative/motion/runtime";
import { copyKeyframes, deleteSelectedKeyframes, moveSelectedKeyframes, pasteKeyframes, selectKeyframesInRange, setWorkAreaEdge, snapTimelineFrame, toggleTimelineSelection, trimLayerRange, upsertTimelineMarker } from "../creative/motion/timeline";
import { frameToTimelineX, timelineXToFrame, zoomTimelineViewport } from "../creative/motion/viewport";
import type { MotionComposition } from "../creative/motion/model";

const assert=(c:unknown,m:string):void=>{if(!c)throw new Error(m)};
export async function runMotionM2CoreTests():Promise<{passed:number;total:number}>{
 const results:{name:string;passed:boolean;error?:string}[]=[];
 const run=(name:string,fn:()=>void)=>{try{fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e instanceof Error?e.message:String(e)})}};
 const comp={id:"c",name:"C",width:1920,height:1080,fps:30,durationFrames:300,workArea:[30,89] as const,layers:[]} satisfies MotionComposition;
 run("playback stops exactly at work-area end",()=>{const n=stepMotionPlayback(comp,{frame:88,playing:true,loop:false,rate:1},.1);assert(n.frame===89&&!n.playing,"non-loop end failed")});
 run("loop playback wraps in integer frames",()=>{const n=stepMotionPlayback(comp,{frame:88,playing:true,loop:true,rate:1},.1);assert(n.frame===31&&n.playing,"loop wrap failed")});
 run("timeline snap resolves distance then priority",()=>{assert(snapTimelineFrame(11,[{frame:10,kind:"marker",priority:1},{frame:12,kind:"keyframe",priority:2}],1)===12,"snap priority failed")});
 run("selection supports additive toggle",()=>{assert(toggleTimelineSelection(["a"],"b",true).join(",")==="a,b"&&toggleTimelineSelection(["a","b"],"a",true).join(",")==="b","selection toggle failed")});
 run("multi-key move is bounded and deterministic",()=>{const n=moveSelectedKeyframes([{id:"a",frame:2},{id:"b",frame:8}],["a","b"],-5,0,20);assert(n[0].frame===0&&n[1].frame===3,"bounded move failed")});
 run("range selection and delete are deterministic",()=>{const keys=[{id:"a",frame:1},{id:"b",frame:5},{id:"c",frame:9}];const ids=selectKeyframesInRange(keys,8,2);assert(ids.join(",")==="b","range select failed");assert(deleteSelectedKeyframes(keys,ids).length===2,"delete failed")});
 run("clipboard preserves relative key spacing",()=>{const keys=[{id:"a",frame:2,value:1},{id:"b",frame:6,value:2}];const clip=copyKeyframes(keys,["a","b"]);const pasted=pasteKeyframes([],clip,20,(id)=>"copy_"+id);assert(pasted[0].frame===20&&pasted[1].frame===24,"clipboard spacing failed")});
 run("layer trim and work area cannot invert ranges",()=>{assert(trimLayerRange(2,10,"in",20)[0]===10,"trim inverted");assert(setWorkAreaEdge([3,9],"end",1,30)[1]===3,"work area inverted")});
 run("markers are frame-normalized and sorted",()=>{const markers=upsertTimelineMarker([{id:"b",frame:10}],{id:"a",frame:2.4});assert(markers[0].id==="a"&&markers[0].frame===2,"marker normalization failed")});
 run("viewport frame mapping survives anchored zoom",()=>{const v={startFrame:0,pixelsPerFrame:10,widthPx:1000};const before=timelineXToFrame(300,v);const z=zoomTimelineViewport(v,2,300);assert(Math.abs(frameToTimelineX(before,z)-300)<.001,"zoom anchor drifted")});
 for(const r of results)console.log(`${r.passed?"✓":"✗"} [${r.passed?"PASS":"FAIL"}] ${r.name}${r.error?` — ${r.error}`:""}`);
 return{passed:results.filter(r=>r.passed).length,total:results.length};
}
