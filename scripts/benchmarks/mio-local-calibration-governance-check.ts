import assert from 'node:assert/strict';
import { summarizeLocalBenchmark } from '../../electron/ipc/nativeLocalBenchmark';
import { reviewLocalCalibration } from '../../src/intelligence/model/MioLocalCalibrationGovernance';
import { selectCalibratedLocalModels } from '../../src/intelligence/model/MioAdaptiveLocalModelSelection';
const MiB=1024*1024,now=1780000000000;
const sample={elapsedMs:700,freeBeforeBytes:6*1024*MiB,freeAfterBytes:5*1024*MiB,
 processRssBeforeBytes:125*MiB,processRssAfterBytes:130*MiB,success:true};
const benchmark=summarizeLocalBenchmark([sample,sample,sample]);
const review={
 model:'qwen2.5:3b',workloads:['CHAT' as const,'CODE' as const],benchmark,
 completedIndependentMemoryTests:3,independentlyTestedFreeMemoryBytes:3*1024*MiB,
 requiredFreeMemoryBytes:4*1024*MiB,verifiedAtMs:now-5000,
 operatorApproval:'I_INDEPENDENTLY_VERIFIED_MODEL_MEMORY_AND_ACCEPT_RISK' as const,
};
async function main(){
 assert.equal(benchmark.ramRequirement,'NOT_DETERMINED');
 assert.equal(benchmark.approval,'REQUIRES_HUMAN_VERIFICATION');
 const approved=reviewLocalCalibration(review,now);
 assert.deepEqual(approved,{model:'qwen2.5:3b',workloads:['CHAT','CODE'],
  requiredFreeMemoryBytes:4*1024*MiB,calibration:'USER_VERIFIED'});
 const pick=selectCalibratedLocalModels({inventory:[{name:'qwen2.5:3b',sizeBytes:null}],
  profiles:[approved],workload:'CODE',freeMemoryBytes:6*1024*MiB,reserveMemoryBytes:768*MiB});
 assert.equal(pick.length,1);
 assert.equal(selectCalibratedLocalModels({inventory:[{name:'qwen2.5:3b',sizeBytes:null}],
  profiles:[approved],workload:'CODE',freeMemoryBytes:4*1024*MiB,reserveMemoryBytes:768*MiB}).length,0);
 const bad=[
  {...review,operatorApproval:'AUTO_APPROVED'},
  {...review,completedIndependentMemoryTests:2},
  {...review,independentlyTestedFreeMemoryBytes:4*1024*MiB},
  {...review,requiredFreeMemoryBytes:3*1024*MiB},
  {...review,verifiedAtMs:now+1},
  {...review,verifiedAtMs:now-31*24*60*60*1000},
  {...review,workloads:['CHAT','CHAT']},
  {...review,model:'../../not-a-model'},
  {...review,benchmark:{...benchmark,ramRequirement:'DETERMINED'}},
  {...review,benchmark:{...benchmark,sampleCount:2,successCount:2}},
  {...review,benchmark:{...benchmark,failureCount:1,successCount:2}},
  {...review,benchmark:{...benchmark,approval:'AUTO_APPROVED'}},
  {...review,benchmark:{...benchmark,p95ElapsedMs:null}},
 ];
 for(const invalid of bad)assert.throws(()=>reviewLocalCalibration(invalid,now),/MIO_CALIBRATION_/);
 assert.throws(()=>reviewLocalCalibration(review,0),/CLOCK_INVALID/);
 assert.throws(()=>reviewLocalCalibration(benchmark,now),/REVIEW_INVALID/);
 assert.ok(!JSON.stringify(approved).includes('operatorApproval'));
 console.log(JSON.stringify({stage:'M-2.02h',approvalGate:'pass',autoApprovalDenied:true,reviewIsOperatorAssertion:true,liveHardware:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
