import { strict as assert } from 'node:assert';
import { buildWaveformPyramid, chooseWaveformLevel, sampleAssetCompatible, type SFXRuntimeSampleEntry } from '../creative/SFXSampleRegistry';
import { buildWaveformPeaks } from '../creative/SFXSampleWorkspace';

const fakeBuffer=(channels:Float32Array[],sampleRate=48000)=>({
  numberOfChannels:channels.length,length:channels[0]?.length??0,sampleRate,
  getChannelData:(channel:number)=>channels[channel],
}) as AudioBuffer;

export function runSFXWaveformRegistryContractTests(){
  let passed=0;const total=8;
  const p=buildWaveformPeaks(new Float32Array([-1,-.5,0,.5,1]),3);
  assert.equal(p.length,3);passed++;
  assert.ok(p.every(x=>x.min>=-1&&x.max<=1&&x.min<=x.max));passed++;
  const pyramid=buildWaveformPyramid(fakeBuffer([new Float32Array([-1,-.5,0,.5,1])]),[2,4,8]);
  assert.deepEqual(pyramid.map(level=>level.buckets),[2,4,5]);passed++;
  assert.equal(pyramid[0].channels.length,1);passed++;
  const entry={waveform:pyramid} as SFXRuntimeSampleEntry;
  assert.equal(chooseWaveformLevel(entry,4)?.buckets,4);passed++;
  assert.equal(chooseWaveformLevel(entry,999)?.buckets,5);passed++;
  const empty={waveform:[]} as unknown as SFXRuntimeSampleEntry;
  assert.equal(chooseWaveformLevel(empty,100),undefined);passed++;
  const original={id:'a',name:'A',sampleRate:48000,channels:2,lengthSamples:96000,contentHash:'hash'};const resampled={...original,sampleRate:44100,lengthSamples:88200};assert.equal(sampleAssetCompatible(original,resampled),true);assert.equal(sampleAssetCompatible(original,{...resampled,channels:1}),false);assert.equal(sampleAssetCompatible(original,{...resampled,contentHash:'other'}),false);passed++;
  return{passed,total};
}
