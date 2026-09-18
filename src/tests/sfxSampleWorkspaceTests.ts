import { strict as assert } from 'node:assert';
import { assetDuration, buildWaveformPeaks, normalizeSampleRegion, regionGainAt, splitSampleRegion, type SFXSampleAsset, type SFXSampleRegion } from '../creative/SFXSampleWorkspace';

export function runSFXSampleWorkspaceTests():{passed:number;total:number}{
  let passed=0;const total=6;
  const asset:SFXSampleAsset={id:'a',name:'Impact',sampleRate:48000,channels:2,lengthSamples:96000};
  const region:SFXSampleRegion={id:'r',assetId:'a',name:'Hit',sourceStart:0,sourceEnd:2,timelineStart:0,gain:1,pan:0,fadeIn:.1,fadeOut:.2,reverse:false};
  assert.equal(assetDuration(asset),2);passed++;
  const normalized=normalizeSampleRegion({...region,pan:2,gain:8,sourceEnd:5},asset);assert.equal(normalized.pan,1);assert.equal(normalized.gain,4);assert.equal(normalized.sourceEnd,2);passed++;
  const split=splitSampleRegion(region,asset,1,'l','r2');assert.ok(split);assert.equal(split![0].sourceEnd,1);assert.equal(split![1].timelineStart,1);passed++;
  assert.equal(regionGainAt(region,0),0);assert.equal(regionGainAt(region,.1),1);passed++;
  const peaks=buildWaveformPeaks(new Float32Array([-1,-.5,.25,1]),2);assert.deepEqual(peaks,[{min:-1,max:-.5},{min:.25,max:1}]);passed++;
  const reversed=splitSampleRegion({...region,reverse:true},asset,.5,'rl','rr');assert.ok(reversed);assert.equal(reversed![0].sourceEnd,1.5);passed++;
  return {passed,total};
}
