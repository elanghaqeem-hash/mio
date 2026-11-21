/** M-2.02g: strictly bounded measurements. Not an automatic model-RAM calibration.
 * No prompt, response, machine identifier, filesystem path or credentials in reports.
 */
export interface LocalBenchmarkSample {
 elapsedMs:number;
 freeBeforeBytes:number;
 freeAfterBytes:number;
 processRssBeforeBytes:number;
 processRssAfterBytes:number;
 success:boolean;
}
export interface LocalBenchmarkSummary {
 schemaVersion:1;
 sampleCount:number;
 successCount:number;
 failureCount:number;
 p50ElapsedMs:number|null;
 p95ElapsedMs:number|null;
 minObservedFreeBytes:number|null;
 maxNodeProcessRssBytes:number|null;
 maxObservedSystemFreeDropBytes:number|null;
 ramRequirement:'NOT_DETERMINED';
 gpuMemory:'NOT_MEASURED';
 approval:'REQUIRES_HUMAN_VERIFICATION';
}
const MAX_SAMPLES=32;
function validBytes(value:number):boolean{return Number.isSafeInteger(value)&&value>=0;}
export function summarizeLocalBenchmark(samples:readonly LocalBenchmarkSample[]):LocalBenchmarkSummary {
 if(!Array.isArray(samples)||samples.length<1||samples.length>MAX_SAMPLES)throw Error('MIO_BENCHMARK_SAMPLES_INVALID');
 for(const sample of samples){
  if(!sample||typeof sample!=='object'||typeof sample.success!=='boolean'||
   !Number.isSafeInteger(sample.elapsedMs)||sample.elapsedMs<0||sample.elapsedMs>300000||
   !validBytes(sample.freeBeforeBytes)||!validBytes(sample.freeAfterBytes)||
   !validBytes(sample.processRssBeforeBytes)||!validBytes(sample.processRssAfterBytes))
   throw Error('MIO_BENCHMARK_SAMPLE_INVALID');
 }
 const success=samples.filter(s=>s.success);
 const sorted=success.map(s=>s.elapsedMs).sort((a,b)=>a-b);
 const quantile=(percent:number):number|null=>sorted.length?sorted[Math.ceil(sorted.length*percent)-1]:null;
 return {
  schemaVersion:1,sampleCount:samples.length,successCount:success.length,
  failureCount:samples.length-success.length,
  p50ElapsedMs:quantile(.5),p95ElapsedMs:quantile(.95),
  minObservedFreeBytes:Math.min(...samples.flatMap(s=>[s.freeBeforeBytes,s.freeAfterBytes])),
  maxNodeProcessRssBytes:Math.max(...samples.flatMap(s=>[s.processRssBeforeBytes,s.processRssAfterBytes])),
  maxObservedSystemFreeDropBytes:Math.max(...samples.map(s=>Math.max(0,s.freeBeforeBytes-s.freeAfterBytes))),
  ramRequirement:'NOT_DETERMINED',gpuMemory:'NOT_MEASURED',approval:'REQUIRES_HUMAN_VERIFICATION',
 };
}
