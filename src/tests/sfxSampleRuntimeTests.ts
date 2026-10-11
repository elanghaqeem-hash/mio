import { strict as assert } from 'node:assert';
import { scheduleSFXSampleRegion } from '../creative/SFXSampleRuntime';
import { effectivePlaybackRate, normalizeSampleRegion, regionTimelineDuration, type SFXSampleAsset, type SFXSampleRegion } from '../creative/SFXSampleWorkspace';

export function runSFXSampleRuntimeContractTests(){
 let passed=0;const total=7;
 const a:SFXSampleAsset={id:'a',name:'Impact',sampleRate:48000,channels:2,lengthSamples:96000};
 const base:SFXSampleRegion={id:'r',assetId:'a',name:'Hit',sourceStart:0,sourceEnd:2,timelineStart:0,gain:1,pan:0,fadeIn:.1,fadeOut:.2,reverse:false,playbackRate:1,pitchSemitones:0,loop:false};
 const n=normalizeSampleRegion({...base,fadeIn:2,fadeOut:2},a);assert.ok(n.fadeIn+n.fadeOut<=2.000001);passed++;
 const p=normalizeSampleRegion({...base,playbackRate:2,pitchSemitones:12},a);assert.equal(effectivePlaybackRate(p),4);assert.equal(regionTimelineDuration(p),.5);passed++;
 const l=normalizeSampleRegion({...base,loop:true,loopStart:-2,loopEnd:99},a);assert.equal(l.loopStart,0);assert.equal(l.loopEnd,2);passed++;
 const tiny=normalizeSampleRegion({...base,sourceStart:1.999,sourceEnd:2},a);assert.ok(tiny.sourceEnd>tiny.sourceStart);passed++;
 const calls:{start?:number[];stop?:number;disconnect:number;ended?:()=>void}={disconnect:0};
 const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){}});
 const source:any={buffer:null,playbackRate:param(),loop:false,loopStart:0,loopEnd:0,connect(){return gain;},start(...x:number[]){calls.start=x;},stop(x:number){calls.stop=x;},disconnect(){calls.disconnect++;},addEventListener(_e:string,fn:()=>void){calls.ended=fn;}};
 const gain:any={gain:param(),connect(){return pan;},disconnect(){calls.disconnect++;}};
 const pan:any={pan:param(),connect(){return destination;},disconnect(){calls.disconnect++;}};
 const destination:any={};
 const context:any={currentTime:5,createBufferSource:()=>source,createGain:()=>gain,createStereoPanner:()=>pan};
 const buffer:any={duration:2};
 const scheduled=scheduleSFXSampleRegion(context,{asset:a,buffer},{...base,loop:true,loopStart:.25,loopEnd:1.75},destination,5);
 assert.equal(source.loop,true);assert.equal(source.loopStart,.25);assert.equal(source.loopEnd,1.75);assert.equal(calls.stop,7);assert.equal(scheduled.stopTime,7);passed++;
 calls.ended?.();assert.equal(calls.disconnect,3);passed++;
 assert.throws(()=>scheduleSFXSampleRegion(context,{asset:{...a,id:'other'},buffer},base,destination,5),/mismatch/);passed++;
 return{passed,total};
}
