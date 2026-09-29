import { validateAudioTranscript } from '../file-intelligence/AudioTranscript';
interface SuiteResult{passed:number;total:number}
export async function runAudioTranscriptTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`AudioTranscript test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const t=validateAudioTranscript({language:'id',segments:[{startSeconds:0,endSeconds:2,text:'Halo Mio',confidence:.9}],source:'LOCAL_STT',engineId:'stt-test',externalProcessing:false,diarization:{performed:false},analyzerVersion:'mio-audio-transcript-v1'});
 check(t.segments[0].text==='Halo Mio','Grounded local transcript validates');
 let overlap=false;try{validateAudioTranscript({...t,segments:[{startSeconds:0,endSeconds:2,text:'a'},{startSeconds:1,endSeconds:3,text:'b'}]});}catch{overlap=true;}check(overlap,'Overlapping transcript segments are rejected');
 let speaker=false;try{validateAudioTranscript({...t,segments:[{startSeconds:0,endSeconds:2,text:'a',speakerId:'speaker-1'}]});}catch{speaker=true;}check(speaker,'Speaker identity requires diarization provenance');
 const d=validateAudioTranscript({...t,segments:[{startSeconds:0,endSeconds:2,text:'a',speakerId:'speaker-1'}],diarization:{performed:true,source:'LOCAL_DIARIZATION',engineId:'diarizer-test'}});
 check(d.diarization.performed,'Grounded local diarization validates');
 let external=false;try{validateAudioTranscript({...t,source:'EXTERNAL_STT',externalProcessing:false});}catch{external=true;}check(external,'External STT cannot masquerade as local');
 return {passed,total};
}
