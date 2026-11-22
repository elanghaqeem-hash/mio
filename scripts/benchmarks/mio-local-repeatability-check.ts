import assert from 'node:assert/strict';
import { summarizeLocalBenchmark } from '../../electron/ipc/nativeLocalBenchmark';
import { assessLocalBenchmarkRepeatability } from '../../src/intelligence/model/MioLocalBenchmarkRepeatability';
function run(latency:number,success=true){
 return summarizeLocalBenchmark(Array.from({length:3},()=>({
  elapsedMs:latency,freeBeforeBytes:4096,freeAfterBytes:3900,
  processRssBeforeBytes:500,processRssAfterBytes:600,success,
 })));
}
async function main(){
 const good=assessLocalBenchmarkRepeatability([run(100),run(130),run(150)],1000);
 assert.equal(good.verdict,'READY_FOR_HUMAN_REVIEW');
 assert.equal(good.totalSuccessfulSamples,9);
 assert.equal(good.worstRunP95Ms,150);
 assert.equal(good.bestRunP95Ms,100);
 assert.equal(good.maxToMinP95Ratio,1.5);
 assert.equal(good.automaticallyApproved,false);
 assert.equal(good.modelMemoryRequirement,'NOT_DETERMINED');
 assert.equal(assessLocalBenchmarkRepeatability([run(100),run(120),run(2000)],1000).verdict,'SLOW');
 assert.equal(assessLocalBenchmarkRepeatability([run(100),run(120),run(400)],1000).verdict,'UNSTABLE');
 const failed=summarizeLocalBenchmark([
  {elapsedMs:100,freeBeforeBytes:4096,freeAfterBytes:3900,processRssBeforeBytes:500,processRssAfterBytes:600,success:true},
  {elapsedMs:100,freeBeforeBytes:4096,freeAfterBytes:3900,processRssBeforeBytes:500,processRssAfterBytes:600,success:true},
  {elapsedMs:100,freeBeforeBytes:4096,freeAfterBytes:3900,processRssBeforeBytes:500,processRssAfterBytes:600,success:false},
 ]);
 assert.equal(assessLocalBenchmarkRepeatability([run(100),failed,run(100)],1000).verdict,'RUN_FAILED');
 for(const invalid of [
  [run(100),run(100)],
  Array.from({length:11},()=>run(100)),
  [run(100),run(100),{...run(100),ramRequirement:'KNOWN'}],
  [run(100),run(100),{...run(100),sampleCount:2}],
 ])assert.throws(()=>assessLocalBenchmarkRepeatability(invalid as ReturnType<typeof run>[],1000),/MIO_REPEATABILITY_/);
 assert.throws(()=>assessLocalBenchmarkRepeatability([run(100),run(100),run(100)],0),/INPUT_INVALID/);
 console.log(JSON.stringify({stage:'M-2.02h',repeatability:'pass',autoApproval:false,liveOllama:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
