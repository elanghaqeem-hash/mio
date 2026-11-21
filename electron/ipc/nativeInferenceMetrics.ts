/** M-2.02d — privacy-preserving, bounded in-memory local inference diagnostics.
 * Never records prompts, responses, IPs, filesystem paths or provider credentials.
 */
export type NativeInferenceOutcome='SUCCESS'|'TIMEOUT'|'STOPPED'|'FAILED';
export interface NativeInferenceDiagnostics {
  schemaVersion:1;
  accepted:number;
  succeeded:number;
  failed:number;
  timedOut:number;
  stopped:number;
  active:number;
  stoppedLatch:boolean;
  lastOutcome:NativeInferenceOutcome|null;
  lastDurationMs:number|null;
  averageDurationMs:number|null;
  p95RecentDurationMs:number|null;
  recentSampleCount:number;
  localOnly:true;
}
export class MioNativeInferenceMetrics {
 private accepted=0;
 private succeeded=0;
 private failed=0;
 private timedOut=0;
 private stopped=0;
 private lastOutcome:NativeInferenceOutcome|null=null;
 private lastDurationMs:number|null=null;
 private readonly durations:number[]=[];
 private totalDuration=0;
 record(outcome:NativeInferenceOutcome,durationMs:number):void {
  const ms=Math.max(0,Math.min(300000,Math.round(Number.isFinite(durationMs)?durationMs:300000)));
  this.accepted++;
  this.lastOutcome=outcome;
  this.lastDurationMs=ms;
  this.totalDuration+=ms;
  if(outcome==='SUCCESS')this.succeeded++;
  else if(outcome==='TIMEOUT')this.timedOut++;
  else if(outcome==='STOPPED')this.stopped++;
  else this.failed++;
  this.durations.push(ms);
  if(this.durations.length>32)this.durations.shift();
 }
 snapshot(active:number,stoppedLatch:boolean):NativeInferenceDiagnostics{
  const sorted=[...this.durations].sort((a,b)=>a-b);
  return {
   schemaVersion:1,
   accepted:this.accepted,succeeded:this.succeeded,failed:this.failed,
   timedOut:this.timedOut,stopped:this.stopped,
   active,stoppedLatch,lastOutcome:this.lastOutcome,lastDurationMs:this.lastDurationMs,
   averageDurationMs:this.accepted?Math.round(this.totalDuration/this.accepted):null,
   p95RecentDurationMs:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null,
   recentSampleCount:sorted.length,localOnly:true,
  };
 }
}
