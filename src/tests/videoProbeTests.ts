import { primaryVideoStream,validateVideoProbe,type VideoProbeResult } from '../file-intelligence/VideoProbe';
interface SuiteResult{passed:number;total:number}
export async function runVideoProbeTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`VideoProbe test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const probe:VideoProbeResult={container:'MP4',durationSeconds:10,streams:[{index:0,kind:'VIDEO',codec:'h264',width:1920,height:1080,frameRate:30},{index:1,kind:'AUDIO',codec:'aac',sampleRate:48000,channels:2}],source:'LOCAL_PROBE',probeId:'test-probe',externalProcessing:false,analyzerVersion:'mio-video-probe-v1'};
 check(validateVideoProbe(probe)===probe,'Valid local video/audio probe passes');
 check(primaryVideoStream(probe)?.index===0,'Primary video stream resolves deterministically');
 const multi={...probe,streams:[{index:3,kind:'VIDEO' as const,codec:'h264',width:640,height:360},{index:2,kind:'VIDEO' as const,codec:'h265',width:3840,height:2160}]};
 check(primaryVideoStream(multi)?.index===2,'Highest-resolution video stream is selected');
 let provenance=false;try{validateVideoProbe({...probe,source:'EXTERNAL_PROBE',externalProcessing:false});}catch{provenance=true;}check(provenance,'External probe cannot masquerade as local');
 let duplicate=false;try{validateVideoProbe({...probe,streams:[probe.streams[0],{...probe.streams[1],index:0}]});}catch{duplicate=true;}check(duplicate,'Duplicate stream indexes are rejected');
 return {passed,total};
}
