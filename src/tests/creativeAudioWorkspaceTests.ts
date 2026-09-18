import { audibleMusicTracks, envelopeTimes, estimateTrackPeak, musicStepDuration, normalizeMusicProject, normalizeSFXPatch, quantizeNoteEvent, transposeNotes } from '../creative/AudioWorkspace';
import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import type { MioMusicProject, MioSFXPatch, MusicTrack, SFXLayer } from '../types/creative';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => { try { await run(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } };

const musicTrack = (id: string, overrides: Partial<MusicTrack> = {}): MusicTrack => ({ id, name: id, role: 'Melody', instrument: 'synth_lead', volume: .8, pan: 0, mute: false, solo: false, notes: [], ...overrides });
const sfxLayer = (): SFXLayer => ({ id: 'fx', name: 'FX', type: 'transient', waveType: 'sine', baseFrequency: 440, frequencySweep: 220, attack: .1, decay: .2, sustain: .5, release: .4, filterCutoff: 2000, filterResonance: 2, distortion: .3, delayTime: .2, delayFeedback: .4, reverbMix: .25, volume: .8 });

export async function runCreativeAudioWorkspaceTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];
  results.push(await test('Music solo and mute routing selects only audible tracks', () => {
    const tracks = [musicTrack('a'), musicTrack('b', { solo: true }), musicTrack('c', { solo: true, mute: true })];
    assert(audibleMusicTracks(tracks).map((track) => track.id).join(',') === 'b', 'solo/mute routing selected incorrect tracks');
    assert(audibleMusicTracks(tracks.map((track) => ({ ...track, solo: false }))).map((track) => track.id).join(',') === 'a,b', 'normal mute routing is incorrect');
    assert(musicStepDuration(120) === .125, 'sixteenth-note duration at 120 BPM is incorrect');
  }));
  results.push(await test('SFX ADSR envelope remains ordered inside short patch duration', () => {
    const times = envelopeTimes({ ...sfxLayer(), attack: 1, decay: 1, release: 1 }, 2, .2);
    assert(times.attack < times.decay && times.decay <= times.sustain && times.sustain < times.end, 'bounded envelope times are not monotonic');
    assert(times.end === 2.2, 'envelope end escaped patch duration');
  }));
  results.push(await test('Audio effect and mixer edits persist through shared undo and redo', () => {
    const sfxName = 'Audio.miosfx'; const sfx: MioSFXPatch = { name: 'Audio', category: 'UI', duration: 1, layers: [sfxLayer()] };
    const sfxKernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(sfxName, sfx, 10, createCreativeWorkspaceId(sfxName)));
    const changedSfx: MioSFXPatch = { ...sfx, layers: [{ ...sfx.layers[0], distortion: .8, delayFeedback: .7, reverbMix: .6 }] };
    sfxKernel.execute({ command: createStudioStateCommand(sfxKernel.snapshot(), sfxName, changedSfx) });
    assert((sfxKernel.snapshot().metadata.legacyData as MioSFXPatch).layers[0].distortion === .8, 'SFX effect edit was not stored');
    sfxKernel.undo(); assert((sfxKernel.snapshot().metadata.legacyData as MioSFXPatch).layers[0].distortion === .3, 'SFX undo failed');

    const musicName = 'Mixer.miomusic'; const music: MioMusicProject = { tempo: 120, key: 'C', scale: 'Major', totalSteps: 16, tracks: [musicTrack('lead')] };
    const musicKernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(musicName, music, 11, createCreativeWorkspaceId(musicName)));
    const mixed: MioMusicProject = { ...music, tracks: [{ ...music.tracks[0], pan: -.6, solo: true }] };
    musicKernel.execute({ command: createStudioStateCommand(musicKernel.snapshot(), musicName, mixed) });
    assert((musicKernel.snapshot().metadata.legacyData as MioMusicProject).tracks[0].solo === true, 'music solo edit was not stored');
    musicKernel.undo(); musicKernel.redo();
    assert((musicKernel.snapshot().metadata.legacyData as MioMusicProject).tracks[0].pan === -.6, 'music mixer redo failed');
  }));
  results.push(await test('Music authoring helpers quantize, transpose, de-duplicate and meter safely', () => {
    const note = quantizeNoteEvent({ id: 'n', pitch: 60.4, startStep: 3, durationSteps: 3, velocity: 1.4 }, 2, 16);
    assert(note.startStep === 4 && note.durationSteps === 4 && note.velocity === 1 && note.pitch === 60, 'quantize did not normalize note');
    assert(transposeNotes([note], 80)[0].pitch === 127, 'transpose did not clamp MIDI pitch');
    const project = normalizeMusicProject({ tempo: 999, key: 'C', scale: 'Major', totalSteps: 16, tracks: [musicTrack('lead', { volume: 2, pan: -4, notes: [note, { ...note, id: 'duplicate' }] })] });
    assert(project.tempo === 300 && project.tracks[0].notes.length === 1, 'project normalization failed');
    assert(estimateTrackPeak(project.tracks[0]) === 1, 'track peak estimate is incorrect');
  }));
  results.push(await test('SFX patch normalization clamps unsafe synthesis and effect values', () => {
    const normalized = normalizeSFXPatch({ name: 'Unsafe', category: 'IMPACT', duration: 999, layers: [{ ...sfxLayer(), baseFrequency: -1, filterCutoff: 99999, delayFeedback: 2, reverbMix: -1, volume: 4 }] });
    assert(normalized.duration === 60, 'patch duration was not bounded');
    assert(normalized.layers[0].baseFrequency === 20 && normalized.layers[0].filterCutoff === 20000, 'frequency bounds failed');
    assert(normalized.layers[0].delayFeedback === .85 && normalized.layers[0].reverbMix === 0 && normalized.layers[0].volume === 1, 'effect bounds failed');
  }));
  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
