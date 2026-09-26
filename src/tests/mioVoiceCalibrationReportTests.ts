import { buildMioVoiceCalibrationReport } from '../services/voice/MioVoiceCalibrationReport';
export async function runMioVoiceCalibrationReportTests():Promise<{passed:number;total:number}>{
 const base={samples:2,classes:{excellent:1,healthy:1,degraded:0,fallback:0},averageFirstChunkLatencyMs:100,averageFirstAudibleLatencyMs:900,totalRebuffers:0,peakBufferAheadMs:2500};
 const a=buildMioVoiceCalibrationReport(base);
 const b=buildMioVoiceCalibrationReport({...base,samples:3,classes:{excellent:1,healthy:1,degraded:1,fallback:0},totalRebuffers:1});
 const checks=[a.status==='insufficient-data',a.notes.some(n=>n.includes('at least 3')),b.status==='ready',b.notes.some(n=>n.includes('Rebuffering')),b.notes.some(n=>n.includes('Degraded'))];
 if(checks.some(v=>!v)) throw new Error('Mio calibration report regression');
 return {passed:checks.length,total:checks.length};
}
