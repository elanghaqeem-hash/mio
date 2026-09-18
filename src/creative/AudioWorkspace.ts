import type { MioMusicProject, MioSFXPatch, MusicTrack, NoteEvent, SFXLayer } from '../types/creative';

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

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const quantizeStep = (step: number, grid = 1, totalSteps = 16): number => {
  const safeGrid = Math.max(1, Math.round(grid));
  return clamp(Math.round(step / safeGrid) * safeGrid, 0, Math.max(0, totalSteps - 1));
};

export const quantizeNoteEvent = (note: NoteEvent, grid = 1, totalSteps = 16): NoteEvent => {
  const startStep = quantizeStep(note.startStep, grid, totalSteps);
  const durationSteps = clamp(Math.round(note.durationSteps / Math.max(1, grid)) * Math.max(1, grid), 1, Math.max(1, totalSteps - startStep));
  return { ...note, startStep, durationSteps, velocity: clamp(note.velocity, .01, 1), pitch: clamp(Math.round(note.pitch), 0, 127) };
};

export const transposeNotes = (notes: NoteEvent[], semitones: number): NoteEvent[] =>
  notes.map((note) => ({ ...note, pitch: clamp(Math.round(note.pitch + semitones), 0, 127) }));

export const normalizeMusicProject = (project: MioMusicProject): MioMusicProject => {
  const totalSteps = clamp(Math.round(project.totalSteps || 16), 4, 512);
  const tempo = clamp(Math.round(project.tempo || 120), 20, 300);
  return {
    ...project,
    tempo,
    totalSteps,
    tracks: project.tracks.map((track) => ({
      ...track,
      volume: clamp(track.volume, 0, 1),
      pan: clamp(track.pan, -1, 1),
      notes: track.notes
        .map((note) => quantizeNoteEvent(note, 1, totalSteps))
        .filter((note, index, notes) => notes.findIndex((candidate) => candidate.pitch === note.pitch && candidate.startStep === note.startStep) === index)
        .sort((a, b) => a.startStep - b.startStep || a.pitch - b.pitch),
    })),
  };
};

export const estimateTrackPeak = (track: MusicTrack): number => {
  if (track.mute) return 0;
  const loudestVelocity = track.notes.reduce((peak, note) => Math.max(peak, clamp(note.velocity, 0, 1)), 0);
  return clamp(track.volume * loudestVelocity, 0, 1);
};

export const sanitizeSFXLayer = (layer: SFXLayer): SFXLayer => ({
  ...layer,
  baseFrequency: clamp(layer.baseFrequency, 20, 20000),
  frequencySweep: clamp(layer.frequencySweep, 20, 20000),
  attack: clamp(layer.attack, .001, 10),
  decay: clamp(layer.decay, .001, 10),
  sustain: clamp(layer.sustain, .001, 1),
  release: clamp(layer.release, .001, 10),
  filterCutoff: clamp(layer.filterCutoff, 20, 20000),
  filterResonance: clamp(layer.filterResonance, 0, 30),
  distortion: clamp(layer.distortion, 0, 1),
  delayTime: clamp(layer.delayTime, 0, 2),
  delayFeedback: clamp(layer.delayFeedback, 0, .85),
  reverbMix: clamp(layer.reverbMix, 0, 1),
  volume: clamp(layer.volume, 0, 1),
});

export const normalizeSFXPatch = (patch: MioSFXPatch): MioSFXPatch => ({
  ...patch,
  duration: clamp(patch.duration, .02, 60),
  layers: patch.layers.map(sanitizeSFXLayer),
});
