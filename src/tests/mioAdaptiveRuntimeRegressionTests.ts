import { MioAdaptiveBufferController } from '../services/voice/MioAdaptiveBufferController';
import { classifyMioPlaybackCondition } from '../services/voice/MioPlaybackConditionClassifier';
import type { MioAudioPlaybackTelemetry } from '../services/voice/MioStreamingAudioPlayer';

const telemetry=(o:Partial<MioAudioPlaybackTelemetry>={}):MioAudioPlaybackTelemetry=>({
 bufferedBytes:4096,firstChunkLatencyMs:120,firstAudibleLatencyMs:700,playbackStartLatencyMs:250,
 playbackMode:'media-source',appendCount:4,rebufferCount:0,maxObservedBufferAheadMs:3000,prebufferTargetChunks:2,...o
});
const sample=(t:MioAudioPlaybackTelemetry,nowMs:number)=>{const c=classifyMioPlaybackCondition(t);return {condition:c.condition,bufferAheadMs:c.bufferAheadMs,rebufferCount:c.rebufferCount,firstAudibleLatencyMs:c.firstAudibleLatencyMs,nowMs};};

export async function runMioAdaptiveRuntimeRegressionTests():Promise<{passed:number;total:number}>{
 const checks:{name:string;ok:boolean}[]=[];
 const add=(name:string,ok:boolean)=>{if(!ok)throw new Error(name);checks.push({name,ok});};
 const fast=new MioAdaptiveBufferController({minChunks:1,maxChunks:4,increaseThresholdMs:900,decreaseThresholdMs:2400,rebufferGuardCount:1,hysteresisSamples:2,cooldownMs:0});
 // Raise once, then require two healthy turns before reducing again.
 const constrained=telemetry({firstAudibleLatencyMs:2600,maxObservedBufferAheadMs:400});
 fast.decide(sample(constrained,0)); fast.decide(sample(constrained,1));
 add('constrained playback raises target after hysteresis',fast.getTargetChunks()===2);
 fast.decide(sample(telemetry(),2)); add('single fast turn cannot reverse target',fast.getTargetChunks()===2);
 fast.decide(sample(telemetry(),3)); add('second fast turn reduces one step',fast.getTargetChunks()===1);
 const guard=new MioAdaptiveBufferController();
 guard.decide(sample(telemetry({rebufferCount:1,maxObservedBufferAheadMs:300}),0));
 add('rebuffer immediately raises next-turn target',guard.getTargetChunks()===2);
 const fallback=classifyMioPlaybackCondition(telemetry({playbackMode:'blob-fallback',maxObservedBufferAheadMs:0}));
 add('blob fallback remains unknown',fallback.condition==='unknown');
 // Integration policy: unknown fallback is intentionally not fed into the controller.
 add('adaptive target remains bounded',guard.getTargetChunks()>=1&&guard.getTargetChunks()<=4);
 return {passed:checks.length,total:checks.length};
}
