import type { SFXLayer } from '../types/creative';

export interface SFXSourceHandle { node:AudioScheduledSourceNode; frequency?:AudioParam; start(when:number):void; stop(when:number):void; }
const seedFor=(id:string)=>Array.from(id).reduce((v,c)=>((v*31)^c.charCodeAt(0))>>>0,0x9e3779b9)||1;
export const createSFXLayerSource=(context:BaseAudioContext,layer:SFXLayer,duration:number):SFXSourceHandle=>{
 if(layer.type==='noise'){const frames=Math.max(1,Math.ceil(context.sampleRate*duration)),buffer=context.createBuffer(1,frames,context.sampleRate),data=buffer.getChannelData(0);let seed=seedFor(layer.id);
 for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=((seed>>>0)/0xffffffff)*2-1;}const source=context.createBufferSource();source.buffer=buffer;return{node:source,start:w=>source.start(w),stop:w=>source.stop(w)};}
 const oscillator=context.createOscillator();oscillator.type=layer.waveType;return{node:oscillator,frequency:oscillator.frequency,start:w=>oscillator.start(w),stop:w=>oscillator.stop(w)};
};
export interface SFXSharedDSPGraph { input:AudioNode; filter:BiquadFilterNode; distortion:WaveShaperNode; envelope:GainNode; dry:GainNode; delay:DelayNode; feedback:GainNode; wet:GainNode; }
export const createSFXSharedDSPGraph=(context:BaseAudioContext,destination:AudioNode):SFXSharedDSPGraph=>{
 const filter=context.createBiquadFilter(),distortion=context.createWaveShaper(),envelope=context.createGain(),dry=context.createGain(),delay=context.createDelay(2),feedback=context.createGain(),wet=context.createGain();
 filter.type='lowpass';filter.connect(distortion);distortion.connect(envelope);envelope.connect(dry);dry.connect(destination);envelope.connect(delay);delay.connect(wet);wet.connect(destination);delay.connect(feedback);feedback.connect(delay);
 return{input:filter,filter,distortion,envelope,dry,delay,feedback,wet};
};
export const configureSFXDistortion=(node:WaveShaperNode,value:number)=>{const amount=Math.max(0,value)*80;node.curve=new Float32Array(Array.from({length:256},(_,i)=>{const x=i*2/255-1;return((3+amount)*x*20*Math.PI/180)/(Math.PI+amount*Math.abs(x));}));node.oversample='2x';};
