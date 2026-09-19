import { classifyMioPlaybackCondition } from '../services/voice/MioPlaybackConditionClassifier';
import type { MioAudioPlaybackTelemetry } from '../services/voice/MioStreamingAudioPlayer';

const base=(o:Partial<MioAudioPlaybackTelemetry>={}):MioAudioPlaybackTelemetry=>({bufferedBytes:1000,firstChunkLatencyMs:100,firstAudibleLatencyMs:1200,playbackStartLatencyMs:500,playbackMode:'media-source',appendCount:3,rebufferCount:0,maxObservedBufferAheadMs:1500,prebufferTargetChunks:2,...o});
export async function runMioPlaybackConditionClassifierTests():Promise<{passed:number;total:number}> {
 const cases=[
  ['fallback is unknown',classifyMioPlaybackCondition(base({playbackMode:'blob-fallback'})).condition==='unknown'],
  ['rebuffer is constrained',classifyMioPlaybackCondition(base({rebufferCount:1})).condition==='constrained'],
  ['high latency is constrained',classifyMioPlaybackCondition(base({firstAudibleLatencyMs:2500})).condition==='constrained'],
  ['low buffer is constrained',classifyMioPlaybackCondition(base({maxObservedBufferAheadMs:500})).condition==='constrained'],
  ['fast requires latency and headroom',classifyMioPlaybackCondition(base({firstAudibleLatencyMs:700,maxObservedBufferAheadMs:3000})).condition==='fast'],
  ['ordinary playback is stable',classifyMioPlaybackCondition(base()).condition==='stable'],
 ] as const;
 for(const [name,ok] of cases) if(!ok) throw new Error(name);
 return {passed:cases.length,total:cases.length};
}
