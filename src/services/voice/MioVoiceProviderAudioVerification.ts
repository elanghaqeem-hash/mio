export interface MioVoiceProviderAudioProbe {
  status: number;
  contentType: string | null;
  engine: string | null;
  streaming: string | null;
  byteLength: number;
}

export interface MioVoiceProviderAudioVerification {
  verified: boolean;
  blockers: string[];
}

export function evaluateMioVoiceProviderAudioProbe(p:MioVoiceProviderAudioProbe):MioVoiceProviderAudioVerification {
 const blockers:string[]=[];
 if(p.status!==200) blockers.push('audio-status');
 if(!/^audio\/(mpeg|wav|x-wav|ogg)(?:;|$)/i.test(p.contentType??'')) blockers.push('audio-content-type');
 if(p.engine!=='v4.7') blockers.push('engine-version');
 if(p.streaming!=='upstream-pass-through') blockers.push('streaming-mode');
 if(!Number.isFinite(p.byteLength)||p.byteLength<=0) blockers.push('empty-audio');
 return {verified:blockers.length===0,blockers};
}
