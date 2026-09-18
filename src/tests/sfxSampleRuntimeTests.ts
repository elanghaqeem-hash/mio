import { strict as assert } from 'node:assert';
import { effectivePlaybackRate, normalizeSampleRegion, regionTimelineDuration, type SFXSampleAsset, type SFXSampleRegion } from '../creative/SFXSampleWorkspace';
export function runSFXSampleRuntimeContractTests(){let passed=0;const total=4;const a:SFXSampleAsset={id:'a',name:'Impact',sampleRate:48000,channels:2,lengthSamples:96000};const base:SFXSampleRegion={id:'r',assetId:'a',name:'Hit',sourceStart:0,sourceEnd:2,timelineStart:0,gain:1,pan:0,fadeIn:.1,fadeOut:.2,reverse:false,playbackRate:1,pitchSemitones:0,loop:false};
const n=normalizeSampleRegion({...base,fadeIn:2,fadeOut:2},a);assert.ok(n.fadeIn+n.fadeOut<=2.000001);passed++;
const p=normalizeSampleRegion({...base,playbackRate:2,pitchSemitones:12},a);assert.equal(effectivePlaybackRate(p),4);assert.equal(regionTimelineDuration(p),.5);passed++;
const l=normalizeSampleRegion({...base,loop:true,loopStart:-2,loopEnd:99},a);assert.equal(l.loopStart,0);assert.equal(l.loopEnd,2);passed++;
const tiny=normalizeSampleRegion({...base,sourceStart:1.999,sourceEnd:2},a);assert.ok(tiny.sourceEnd>tiny.sourceStart);passed++;return{passed,total};}
