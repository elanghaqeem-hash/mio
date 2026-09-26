import { MioVoiceCalibrationSession } from '../services/voice/MioVoiceCalibrationSession';
export async function runMioVoiceCalibrationSessionTests():Promise<{passed:number;total:number}>{
 const s=new MioVoiceCalibrationSession();
 s.add({class:'excellent',firstChunkLatencyMs:100,firstAudibleLatencyMs:700,rebufferCount:0,bufferAheadMs:3000,recommendation:'keep'});
 s.add({class:'degraded',firstChunkLatencyMs:300,firstAudibleLatencyMs:2500,rebufferCount:2,bufferAheadMs:500,recommendation:'increase-buffer'});
 s.add({class:'fallback',firstChunkLatencyMs:200,firstAudibleLatencyMs:1800,rebufferCount:0,bufferAheadMs:0,recommendation:'fallback-path'});
 const x=s.summary();
 const checks=[x.samples===3,x.classes.excellent===1,x.classes.degraded===1,x.classes.fallback===1,x.averageFirstChunkLatencyMs===200,x.averageFirstAudibleLatencyMs===5000/3,x.totalRebuffers===2,x.peakBufferAheadMs===3000];
 if(checks.some(v=>!v)) throw new Error('Mio calibration session aggregation regression');
 s.reset(); if(s.summary().samples!==0) throw new Error('Mio calibration session reset regression');
 return {passed:checks.length+1,total:checks.length+1};
}
