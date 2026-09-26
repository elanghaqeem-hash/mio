import { evaluateMioVoiceCalibration } from '../services/voice/MioVoiceCalibrationProfile';
import type { MioAudioPlaybackTelemetry } from '../services/voice/MioStreamingAudioPlayer';
const t=(o:Partial<MioAudioPlaybackTelemetry>={}):MioAudioPlaybackTelemetry=>({bufferedBytes:4096,firstChunkLatencyMs:100,firstAudibleLatencyMs:700,playbackStartLatencyMs:250,playbackMode:'media-source',appendCount:4,rebufferCount:0,maxObservedBufferAheadMs:3000,prebufferTargetChunks:2,...o});
export async function runMioVoiceCalibrationProfileTests():Promise<{passed:number;total:number}>{
 const cases=[
  evaluateMioVoiceCalibration(t()).class==='excellent',
  evaluateMioVoiceCalibration(t({firstAudibleLatencyMs:1400,maxObservedBufferAheadMs:1600})).class==='healthy',
  evaluateMioVoiceCalibration(t({rebufferCount:1})).class==='degraded',
  evaluateMioVoiceCalibration(t({firstAudibleLatencyMs:2500})).recommendation==='increase-buffer',
  evaluateMioVoiceCalibration(t({playbackMode:'blob-fallback',maxObservedBufferAheadMs:0})).class==='fallback',
 ] as const;
 if(cases.some(v=>!v)) throw new Error('Mio calibration profile regression');
 return {passed:cases.length,total:cases.length};
}
