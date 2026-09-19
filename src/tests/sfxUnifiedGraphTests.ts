import { strict as assert } from 'node:assert';
import { configureSFXDistortion, createSFXLayerSource, createSFXSharedDSPGraph } from '../creative/SFXUnifiedGraph';
import type { SFXLayer } from '../types/creative';

const layer=(overrides:Partial<SFXLayer>={}):SFXLayer=>({id:'layer-a',name:'Layer',type:'oscillator',waveType:'sine',baseFrequency:440,frequencySweep:440,attack:.01,decay:.1,sustain:.8,release:.2,filterCutoff:12000,filterResonance:0,distortion:0,delayTime:0,delayFeedback:0,reverbMix:0,volume:1,...overrides});

const connectable=()=>({connections:[] as unknown[],connect(target:unknown){this.connections.push(target);return target;}});
export function runSFXUnifiedGraphContractTests(){
  let passed=0;const total=5;
  let started=0,stopped=0;
  const oscillator:any={...connectable(),type:'sine',frequency:{},start(){started++;},stop(){stopped++;}};
  const oscContext:any={createOscillator:()=>oscillator};
  const osc=createSFXLayerSource(oscContext,layer({waveType:'square'}),1);
  assert.equal(oscillator.type,'square');assert.equal(osc.frequency,oscillator.frequency);osc.start(0);osc.stop(1);assert.equal(started,1);assert.equal(stopped,1);passed++;

  const makeNoiseContext=()=>{let data=new Float32Array(0);const source:any={...connectable(),buffer:null,start(){},stop(){}};return{context:{sampleRate:8,createBuffer:(_c:number,length:number)=>{data=new Float32Array(length);return{getChannelData:()=>data};},createBufferSource:()=>source},getData:()=>data};};
  const n1=makeNoiseContext(),n2=makeNoiseContext();createSFXLayerSource(n1.context as any,layer({type:'noise',id:'seeded'}),1);createSFXLayerSource(n2.context as any,layer({type:'noise',id:'seeded'}),1);
  assert.equal(n1.getData().length,8);assert.deepEqual(Array.from(n1.getData()),Array.from(n2.getData()));assert.ok(Array.from(n1.getData()).every(v=>v>=-1&&v<=1));passed++;

  const filter:any={...connectable(),type:''},distortion:any={...connectable(),curve:null,oversample:'none'},envelope:any=connectable(),dry:any=connectable(),delay:any=connectable(),feedback:any=connectable(),wet:any=connectable(),destination:any={};
  const graphContext:any={createBiquadFilter:()=>filter,createWaveShaper:()=>distortion,createGain:()=>[envelope,dry,feedback,wet].shift?.(),createDelay:()=>delay};
  const gains=[envelope,dry,feedback,wet];let gainIndex=0;graphContext.createGain=()=>gains[gainIndex++];
  const graph=createSFXSharedDSPGraph(graphContext,destination);
  assert.equal(graph.input,filter);assert.equal(filter.type,'lowpass');assert.ok(filter.connections.includes(distortion));assert.ok(dry.connections.includes(destination));assert.ok(wet.connections.includes(destination));passed++;

  configureSFXDistortion(distortion,.5);assert.equal(distortion.curve.length,256);assert.equal(distortion.oversample,'2x');passed++;

  const different=makeNoiseContext();createSFXLayerSource(different.context as any,layer({type:'noise',id:'different'}),1);
  assert.notDeepEqual(Array.from(n1.getData()),Array.from(different.getData()));passed++;
  return{passed,total};
}
