/** M-2.02h — explicit operator-reviewed local model calibration.
 * Benchmark summaries never self-certify RAM requirements or model suitability.
 * An approval is an operator assertion, not a cryptographic attestation.
 */
import type { CognitiveWorkload } from './MioCognitiveOrchestrator';
import type { CalibratedLocalModel } from './MioAdaptiveLocalModelSelection';
import type { LocalBenchmarkSummary } from '../../../electron/ipc/nativeLocalBenchmark';

export interface LocalCalibrationReview {
 model:string;
 workloads:readonly CognitiveWorkload[];
 benchmark:LocalBenchmarkSummary;
 completedIndependentMemoryTests:number;
 independentlyTestedFreeMemoryBytes:number;
 requiredFreeMemoryBytes:number;
 verifiedAtMs:number;
 operatorApproval:'I_INDEPENDENTLY_VERIFIED_MODEL_MEMORY_AND_ACCEPT_RISK';
}
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/;
const WORKLOADS:readonly CognitiveWorkload[]=['CHAT','ANALYSIS','CODE','CREATIVE'];
const MAX_AGE_MS=30*24*60*60*1000;
const MIN_MARGIN_BYTES=768*1024*1024;
const MAX_BYTES=2*1024**4;
function positiveBytes(x:unknown):x is number {
 return typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=MAX_BYTES;
}
/** Only trusted, explicitly collected operator reviews can enter the adaptive profile list.
 * Do not expose this function directly to arbitrary renderer model output.
 */
export function reviewLocalCalibration(input:unknown,nowMs:number=Date.now()):CalibratedLocalModel {
 if(!Number.isSafeInteger(nowMs)||nowMs<1)throw Error('MIO_CALIBRATION_CLOCK_INVALID');
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('MIO_CALIBRATION_REVIEW_INVALID');
 const v=input as Partial<LocalCalibrationReview>;
 if(typeof v.model!=='string'||!NAME.test(v.model)||!Array.isArray(v.workloads)||
  v.workloads.length<1||v.workloads.length>WORKLOADS.length||
  new Set(v.workloads).size!==v.workloads.length||
  v.workloads.some((w:CognitiveWorkload)=>!WORKLOADS.includes(w))||
  v.operatorApproval!=='I_INDEPENDENTLY_VERIFIED_MODEL_MEMORY_AND_ACCEPT_RISK'||
  !Number.isSafeInteger(v.completedIndependentMemoryTests)||v.completedIndependentMemoryTests!<3||
  !positiveBytes(v.independentlyTestedFreeMemoryBytes)||
  !positiveBytes(v.requiredFreeMemoryBytes)||
  v.independentlyTestedFreeMemoryBytes>MAX_BYTES-MIN_MARGIN_BYTES||
  v.requiredFreeMemoryBytes<v.independentlyTestedFreeMemoryBytes+MIN_MARGIN_BYTES||
  !Number.isSafeInteger(v.verifiedAtMs)||v.verifiedAtMs!>nowMs||
  nowMs-v.verifiedAtMs!>MAX_AGE_MS)
  throw Error('MIO_CALIBRATION_REVIEW_INVALID');
 const summary=v.benchmark;
 if(!summary||typeof summary!=='object'||summary.schemaVersion!==1||
  !Number.isSafeInteger(summary.sampleCount)||summary.sampleCount<3||summary.sampleCount>32||
  summary.successCount!==summary.sampleCount||summary.failureCount!==0||
  summary.ramRequirement!=='NOT_DETERMINED'||
  summary.approval!=='REQUIRES_HUMAN_VERIFICATION'||
  !Number.isSafeInteger(summary.p95ElapsedMs)||summary.p95ElapsedMs!<1||
  summary.gpuMemory!=='NOT_MEASURED')
  throw Error('MIO_CALIBRATION_BENCHMARK_INVALID');
 return {
  model:v.model,
  workloads:[...v.workloads],
  requiredFreeMemoryBytes:v.requiredFreeMemoryBytes,
  calibration:'USER_VERIFIED',
 };
}
