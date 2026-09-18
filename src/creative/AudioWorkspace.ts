import type { MusicTrack, NoteEvent, SFXLayer } from '../types/creative';

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

export const clampMusicStep = (step: number, totalSteps: number): number =>
  Math.max(0, Math.min(Math.max(1, totalSteps) - 1, Math.round(Number.isFinite(step) ? step : 0)));

export const normalizeMusicNote = (note: NoteEvent, totalSteps: number): NoteEvent => {
  const startStep = clampMusicStep(note.startStep, totalSteps);
  const available = Math.max(1, Math.max(1, totalSteps) - startStep);
  return {
    ...note,
    pitch: Math.max(0, Math.min(127, Math.round(Number.isFinite(note.pitch) ? note.pitch : 60))),
    startStep,
    durationSteps: Math.max(1, Math.min(available, Math.round(Number.isFinite(note.durationSteps) ? note.durationSteps : 1))),
    velocity: Math.max(.01, Math.min(1, Number.isFinite(note.velocity) ? note.velocity : .8)),
  };
};

export const moveMusicNote = (note: NoteEvent, deltaStep: number, deltaPitch: number, totalSteps: number): NoteEvent =>
  normalizeMusicNote({ ...note, startStep: note.startStep + deltaStep, pitch: note.pitch + deltaPitch }, totalSteps);

export const resizeMusicNote = (note: NoteEvent, durationSteps: number, totalSteps: number): NoteEvent =>
  normalizeMusicNote({ ...note, durationSteps }, totalSteps);

export const duplicateMusicNote = (note: NoteEvent, totalSteps: number, id: string): NoteEvent => {
  const desiredStart = note.startStep + Math.max(1, note.durationSteps);
  const maxStart = Math.max(0, totalSteps - 1);
  return normalizeMusicNote({ ...note, id, startStep: Math.min(desiredStart, maxStart) }, totalSteps);
};

export const quantizeMusicNote = (note: NoteEvent, gridSteps: number, totalSteps: number): NoteEvent => {
  const grid = Math.max(1, Math.round(gridSteps));
  return normalizeMusicNote({ ...note, startStep: Math.round(note.startStep / grid) * grid }, totalSteps);
};

export const musicProjectDuration = (tempo: number, totalSteps: number): number =>
  musicStepDuration(tempo) * Math.max(1, totalSteps);

export const musicPlayheadStep = (elapsedSeconds: number, tempo: number, totalSteps: number): number => {
  const duration = musicStepDuration(tempo);
  const steps = Math.max(1, totalSteps);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  return Math.floor(elapsedSeconds / duration) % steps;
};
