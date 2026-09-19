import { strict as assert } from 'node:assert';
import { moveTimelineRegions, normalizeTimelineMarkers, normalizeTimelineViewport, selectTimelineRegion, snapTimelineTime, timelineExtent, timelineGridStep, timelineTimeToX, timelineXToTime } from '../creative/SFXTimelineWorkspace';
import type { SFXSampleRegion } from '../creative/SFXSampleWorkspace';

const region=(id:string,start:number,duration=1):SFXSampleRegion=>({id,assetId:'asset',name:id,sourceStart:0,sourceEnd:duration,timelineStart:start,gain:1,pan:0,fadeIn:0,fadeOut:0,reverse:false,playbackRate:1,pitchSemitones:0,loop:false});
export function runSFXTimelineWorkspaceTests(){
 let passed=0;const total=8;
 const viewport=normalizeTimelineViewport({start:-2,end:8,pixelsPerSecond:200},5);assert.deepEqual(viewport,{start:0,end:5,pixelsPerSecond:200});passed++;
 assert.equal(timelineTimeToX(2,{start:1,end:5,pixelsPerSecond:100}),100);assert.equal(timelineXToTime(100,{start:1,end:5,pixelsPerSecond:100}),2);passed++;
 assert.equal(timelineGridStep(900),.01);assert.equal(timelineGridStep(120),.1);assert.equal(timelineGridStep(20),.5);passed++;
 const regions=[region('a',0,1),region('b',2,1)];assert.equal(snapTimelineTime(1.98,'region',{start:0,end:5,pixelsPerSecond:200},regions),2);assert.equal(snapTimelineTime(1.13,'grid',{start:0,end:5,pixelsPerSecond:100},regions),1.1);passed++;
 const moved=moveTimelineRegions(regions,['a'],1.98,'region',{start:0,end:5,pixelsPerSecond:200});assert.equal(moved[0].timelineStart,2);assert.equal(moved[1].timelineStart,2);passed++;
 const group=moveTimelineRegions([region('a',1),region('b',2) ],['a','b'],-5,'off',{start:0,end:5,pixelsPerSecond:100});assert.equal(group[0].timelineStart,0);assert.equal(group[1].timelineStart,1);passed++;
 assert.equal(timelineExtent([region('late',3,2)]),5);passed++;
 let selection={regionIds:['a'],anchorTime:null as number|null};selection=selectTimelineRegion(selection,'b',true);assert.deepEqual(selection.regionIds,['a','b']);selection=selectTimelineRegion(selection,'a',true);assert.deepEqual(selection.regionIds,['b']);assert.deepEqual(normalizeTimelineMarkers([{id:'b',time:9,label:'  '},{id:'a',time:1,label:' Hit '}],5),[{id:'a',time:1,label:'Hit'},{id:'b',time:5,label:'Marker'}]);passed++;
 return{passed,total};
}
