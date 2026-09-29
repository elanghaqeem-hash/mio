import { mergeSceneCandidates,planVideoSampling } from '../file-intelligence/VideoSampling';
interface SuiteResult{passed:number;total:number}
export async function runVideoSamplingTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`VideoSampling test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const p=planVideoSampling(30,{maxSamples:4});
 check(p.points.map(x=>x.timestampSeconds).join(',')==='0,10,20,30','Uniform timestamps are deterministic');
 check(p.points[0].reason==='START'&&p.points[3].reason==='END','Sampling endpoints retain reasons');
 const bounded=planVideoSampling(3600,{maxSamples:12});
 check(bounded.points.length===12,'Long videos respect sample budget');
 const merged=mergeSceneCandidates(planVideoSampling(30,{maxSamples:6}),[5,15,25,999,-1]);
 check(merged.points.length<=6&&merged.points.some(x=>x.timestampSeconds===5&&x.reason==='SCENE_CANDIDATE'),'Valid scene candidates merge within budget');
 let invalid=false;try{planVideoSampling(0);}catch{invalid=true;}check(invalid,'Invalid duration is rejected');
 let excessive=false;try{planVideoSampling(10,{maxSamples:121});}catch{excessive=true;}check(excessive,'Excessive sample budget is rejected');
 return {passed,total};
}
