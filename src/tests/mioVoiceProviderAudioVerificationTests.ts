import { evaluateMioVoiceProviderAudioProbe } from '../services/voice/MioVoiceProviderAudioVerification';
export async function runMioVoiceProviderAudioVerificationTests():Promise<{passed:number;total:number}>{
 const ok=evaluateMioVoiceProviderAudioProbe({status:200,contentType:'audio/mpeg',engine:'v4.7',streaming:'upstream-pass-through',byteLength:1024});
 const bad=evaluateMioVoiceProviderAudioProbe({status:502,contentType:'application/json',engine:'v4.5',streaming:null,byteLength:0});
 const checks=[ok.verified,!bad.verified,bad.blockers.includes('audio-status'),bad.blockers.includes('audio-content-type'),bad.blockers.includes('engine-version'),bad.blockers.includes('empty-audio')];
 if(checks.some(v=>!v)) throw new Error('Mio Voice provider audio verification regression');
 return {passed:checks.length,total:checks.length};
}
