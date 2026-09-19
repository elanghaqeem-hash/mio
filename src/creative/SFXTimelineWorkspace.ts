import { regionTimelineDuration, type SFXSampleRegion } from './SFXSampleWorkspace';

export type SFXTimelineSnapMode='off'|'grid'|'region';
export interface SFXTimelineViewport { start:number; end:number; pixelsPerSecond:number; }
export interface SFXTimelineSelection { regionIds:string[]; anchorTime:number|null; }
export interface SFXTimelineMarker { id:string; time:number; label:string; }

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export const normalizeTimelineViewport=(viewport:SFXTimelineViewport,duration:number):SFXTimelineViewport=>{
 const total=Math.max(.02,duration),span=clamp(viewport.end-viewport.start,.02,total),start=clamp(viewport.start,0,Math.max(0,total-span));
 return{start,end:start+span,pixelsPerSecond:clamp(viewport.pixelsPerSecond,20,4000)};
};
export const timelineTimeToX=(time:number,viewport:SFXTimelineViewport):number=>(time-viewport.start)*viewport.pixelsPerSecond;
export const timelineXToTime=(x:number,viewport:SFXTimelineViewport):number=>viewport.start+x/Math.max(1,viewport.pixelsPerSecond);
export const timelineGridStep=(pixelsPerSecond:number):number=>pixelsPerSecond>=800?.01:pixelsPerSecond>=400?.025:pixelsPerSecond>=200?.05:pixelsPerSecond>=100?.1:pixelsPerSecond>=50?.25:.5;
export const snapTimelineTime=(time:number,mode:SFXTimelineSnapMode,viewport:SFXTimelineViewport,regions:SFXSampleRegion[],excludeIds:string[]=[]):number=>{
 if(mode==='off')return Math.max(0,time);
 const candidates=mode==='grid'?[]:regions.filter(r=>!excludeIds.includes(r.id)).flatMap(r=>[r.timelineStart,r.timelineStart+regionTimelineDuration(r)]);
 const threshold=8/Math.max(1,viewport.pixelsPerSecond);
 const nearest=candidates.reduce<number|null>((best,candidate)=>Math.abs(candidate-time)<=threshold&&(best===null||Math.abs(candidate-time)<Math.abs(best-time))?candidate:best,null);
 if(nearest!==null)return Math.max(0,nearest);
 const step=timelineGridStep(viewport.pixelsPerSecond);
 return Math.max(0,Math.round(time/step)*step);
};
export const moveTimelineRegions=(regions:SFXSampleRegion[],selectedIds:string[],delta:number,snapMode:SFXTimelineSnapMode,viewport:SFXTimelineViewport):SFXSampleRegion[]=>{
 const selected=new Set(selectedIds),moving=regions.filter(r=>selected.has(r.id));if(!moving.length)return regions;
 const earliest=Math.min(...moving.map(r=>r.timelineStart)),raw=Math.max(0,earliest+delta),snapped=snapTimelineTime(raw,snapMode,viewport,regions,selectedIds),applied=snapped-earliest;
 return regions.map(r=>selected.has(r.id)?{...r,timelineStart:Math.max(0,r.timelineStart+applied)}:r);
};
export const timelineExtent=(regions:SFXSampleRegion[],minimum=.02):number=>Math.max(minimum,...regions.map(r=>r.timelineStart+regionTimelineDuration(r)));
export const selectTimelineRegion=(selection:SFXTimelineSelection,id:string,additive=false):SFXTimelineSelection=>{
 if(!additive)return{regionIds:[id],anchorTime:selection.anchorTime};
 const exists=selection.regionIds.includes(id);return{...selection,regionIds:exists?selection.regionIds.filter(x=>x!==id):[...selection.regionIds,id]};
};
export const normalizeTimelineMarkers=(markers:SFXTimelineMarker[],duration:number):SFXTimelineMarker[]=>markers.map(m=>({...m,time:clamp(m.time,0,Math.max(.02,duration)),label:m.label.trim()||'Marker'})).sort((a,b)=>a.time-b.time);
