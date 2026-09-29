import { primaryAudioStream,validateAudioProbe,type AudioProbeResult } from '../file-intelligence/AudioProbe';
interface SuiteResult{passed:number;total:number}
export async function runAudioProbeTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`AudioProbe test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const p:AudioProbeResult={container:'WAV',durationSeconds:20,streams:[{index:0,codec:'pcm_s16le',sampleRate:48000,channels:2},{index:1,codec:'pcm_s16le',sampleRate:44100,channels:1}],source:'LOCAL_PROBE',probeId:'local-test',externalProcessing:false,analyzerVersion:'mio-audio-probe-v1'};
 check(validateAudioProbe(p)===p,'Valid local audio probe passes');
 check(primaryAudioStream(p)?.index===0,'Primary audio stream resolves deterministically');
 let provenance=false;try{validateAudioProbe({...p,source:'EXTERNAL_PROBE',externalProcessing:false});}catch{provenance=true;}check(provenance,'External probe cannot masquerade as local');
 let duplicate=false;try{validateAudioProbe({...p,streams:[p.streams[0],{...p.streams[1],index:0}]});}catch{duplicate=true;}check(duplicate,'Duplicate stream indexes are rejected');
 return {passed,total};
}
