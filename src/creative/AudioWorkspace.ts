import type { MusicTrack, SFXLayer } from '../types/creative';

export const musicStepDuration = (tempo: number): number => 60 / Math.max(20, tempo) / 4;

export const audibleMusicTracks = (tracks: MusicTrack[]): MusicTrack[] => {
  const soloed = tracks.filter((track) => track.solo && !track.mute);
  return soloed.length ? soloed : tracks.filter((track) => !track.mute);
};

export const envelopeTimes = (layer: SFXLayer, start: number, duration: number): { attack: number; decay: number; sustain: number; end: number } => {
  const end = start + Math.max(.02, duration);
  const attack = Math.min(end - .015, start + Math.max(.001, layer.attack));
  const decay = Math.min(end - .01, attack + Math.max(.001, layer.decay));
  const sustain = Math.max(decay, end - Math.max(.005, layer.release));
  return { attack, decay, sustain, end };
};
