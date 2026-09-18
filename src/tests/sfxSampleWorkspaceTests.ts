import { strict as assert } from 'node:assert';
import {assetDuration,buildWaveformPeaks,effectivePlaybackRate,normalizeSampleRegion,regionGainAt,regionTimelineDuration,splitSampleRegion,type SFXSampleAsset,type SFXSampleRegion} from '../creative/SFXSampleWorkspace';
export function runSFXSampleWorkspaceTests(){let passed=0;const total=8;const a:SFXSampleAsset={id:'a',name:'Impact',sampleRate:48000,channels:2,lengthSamples:96000};
const r:SFXSampleRegion={id:'r',assetId:'a',name:'Hit',sourceStart:0,sourceEnd:2,timelineStart:0,gain:1,pan:0,fadeIn:.1,fadeOut:.2,reverse:false,playbackRate:1,pitchSemitones:0,loop:false};
assert.equal(assetDuration(a),2);passed++;const n=normalizeSampleRegion({...r,pan:2,gain:8,sourceEnd:5},a);assert.equal(n.pan,1);assert.equal(n.gain,4);assert.equal(n.sourceEnd,2);passed++;
const s=splitSampleRegion(r,a,1,'l','r2');assert.ok(s);assert.equal(s![0].sourceEnd,1);assert.equal(s![1].timelineStart,1);passed++;
assert.equal(regionGainAt(r,0),0);assert.equal(regionGainAt(r,.1),1);passed++;assert.deepEqual(buildWaveformPeaks(new Float32Array([-1,-.5,.25,1]),2),[{min:-1,max:-.5},{min:.25,max:1}]);passed++;
const rev=splitSampleRegion({...r,reverse:true},a,.5,'rl','rr');assert.ok(rev);assert.equal(rev![0].sourceEnd,1.5);passed++;
const fast=normalizeSampleRegion({...r,playbackRate:2},a);assert.equal(regionTimelineDuration(fast),1);passed++;
const pitched=normalizeSampleRegion({...r,pitchSemitones:12},a);assert.equal(effectivePlaybackRate(pitched),2);assert.equal(regionTimelineDuration(pitched),1);passed++;return{passed,total};}
