import assert from 'node:assert/strict';
import { summarizeLocalBenchmark } from '../../electron/ipc/nativeLocalBenchmark';
async function main(){
 const summary=summarizeLocalBenchmark([
  {elapsedMs:40,freeBeforeBytes:1000,freeAfterBytes:900,processRssBeforeBytes:50,processRssAfterBytes:70,success:true},
  {elapsedMs:100,freeBeforeBytes:900,freeAfterBytes:950,processRssBeforeBytes:70,processRssAfterBytes:60,success:true},
  {elapsedMs:55,freeBeforeBytes:950,freeAfterBytes:700,processRssBeforeBytes:60,processRssAfterBytes:90,success:false},
 ]);
 assert.equal(summary.schemaVersion,1);
 assert.equal(summary.sampleCount,3);
 assert.equal(summary.successCount,2);
 assert.equal(summary.failureCount,1);
 assert.equal(summary.p50ElapsedMs,40);
 assert.equal(summary.p95ElapsedMs,100);
 assert.equal(summary.minObservedFreeBytes,700);
 assert.equal(summary.maxNodeProcessRssBytes,90);
 assert.equal(summary.maxObservedSystemFreeDropBytes,250);
 assert.equal(summary.ramRequirement,'NOT_DETERMINED');
 assert.equal(summary.approval,'REQUIRES_HUMAN_VERIFICATION');
 assert.equal(summary.gpuMemory,'NOT_MEASURED');
 const failed=summarizeLocalBenchmark([{elapsedMs:5,freeBeforeBytes:20,freeAfterBytes:10,processRssBeforeBytes:10,processRssAfterBytes:10,success:false}]);
 assert.equal(failed.p95ElapsedMs,null);
 for(const bad of [
  [],Array.from({length:33},()=>({elapsedMs:1,freeBeforeBytes:2,freeAfterBytes:1,processRssBeforeBytes:1,processRssAfterBytes:1,success:true})),
  [{elapsedMs:NaN,freeBeforeBytes:2,freeAfterBytes:1,processRssBeforeBytes:1,processRssAfterBytes:1,success:true}],
  [{elapsedMs:1,freeBeforeBytes:-1,freeAfterBytes:1,processRssBeforeBytes:1,processRssAfterBytes:1,success:true}],
 ])assert.throws(()=>summarizeLocalBenchmark(bad),/MIO_BENCHMARK_/);
 const flat=JSON.stringify(summary);
 assert.ok(!flat.includes('prompt')&&!flat.includes('response')&&!flat.includes('hostname')&&!flat.includes('filePath'));
 console.log(JSON.stringify({stage:'M-2.02g',benchmarkSummary:'pass',realHardware:false,realOllama:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
