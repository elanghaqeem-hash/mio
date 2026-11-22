/** M-2.02h — repeatability gate for separately collected benchmark runs.
 * No local model calibration or RAM requirement is inferred from these metrics.
 */
import type { LocalBenchmarkSummary } from '../../../electron/ipc/nativeLocalBenchmark';
export type RepeatabilityVerdict='READY_FOR_HUMAN_REVIEW'|'RUN_FAILED'|'SLOW'|'UNSTABLE';
export interface LocalRepeatabilityReport {
 schemaVersion:1;
 verdict:RepeatabilityVerdict;
 runCount:number;
 totalSuccessfulSamples:number;
 worstRunP95Ms:number;
 bestRunP95Ms:number;
 maxToMinP95Ratio:number|null;
 modelMemoryRequirement:'NOT_DETERMINED';
 automaticallyApproved:false;
}
export function assessLocalBenchmarkRepeatability(
 runs:readonly LocalBenchmarkSummary[],
 maxP95Ms:number,
 maxP95Ratio=3
):LocalRepeatabilityReport{
 if(!Array.isArray(runs)||runs.length<3||runs.length>10||
  !Number.isSafeInteger(maxP95Ms)||maxP95Ms<1||maxP95Ms>120000||
  !Number.isFinite(maxP95Ratio)||maxP95Ratio<1||maxP95Ratio>10)
  throw Error('MIO_REPEATABILITY_INPUT_INVALID');
 let successful=0;
 const latencies:number[]=[];
 let failed=false;
 for(const s of runs){
  if(!s||s.schemaVersion!==1||!Number.isSafeInteger(s.sampleCount)||
   s.sampleCount<3||s.sampleCount>32||!Number.isSafeInteger(s.successCount)||
   s.successCount<0||s.successCount>s.sampleCount||
   s.failureCount!==s.sampleCount-s.successCount||
   s.ramRequirement!=='NOT_DETERMINED'||s.approval!=='REQUIRES_HUMAN_VERIFICATION'||
   s.gpuMemory!=='NOT_MEASURED'||!Number.isSafeInteger(s.p95ElapsedMs)||
   s.p95ElapsedMs!<0||s.p95ElapsedMs!>300000)
   throw Error('MIO_REPEATABILITY_EVIDENCE_INVALID');
  successful+=s.successCount;
  if(s.successCount!==s.sampleCount)failed=true;
  latencies.push(s.p95ElapsedMs!);
 }
 const best=Math.min(...latencies),worst=Math.max(...latencies);
 const ratio=best===0?(worst===0?1:Infinity):worst/best;
 const verdict:RepeatabilityVerdict=failed?'RUN_FAILED':worst>maxP95Ms?'SLOW':ratio>maxP95Ratio?'UNSTABLE':'READY_FOR_HUMAN_REVIEW';
 return {schemaVersion:1,verdict,runCount:runs.length,totalSuccessfulSamples:successful,
  worstRunP95Ms:worst,bestRunP95Ms:best,maxToMinP95Ratio:Number.isFinite(ratio)?Math.round(ratio*100)/100:null,
  modelMemoryRequirement:'NOT_DETERMINED',automaticallyApproved:false};
}
