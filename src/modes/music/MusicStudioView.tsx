import React, { useState, useRef, useEffect } from 'react';
import { MioMusicProject, NoteEvent } from '../../types/creative';
import { Play, Square, Music, ShieldCheck, RotateCcw } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { emergencyStop } from '../../core/EmergencyStop';

export const MusicStudioView: React.FC = () => {
  const [project, setProject] = useState<MioMusicProject>({
    tempo: 124,
    key: 'A',
    scale: 'Cyberpunk Aeolian',
    totalSteps: 16,
    tracks: [
      { id: 'trk_lead', name: 'Cyberpunk Lead Synth', role: 'Melody', instrument: 'synth_lead', volume: 0.8, pan: 0, mute: false, solo: false, notes: [
        { id: 'n1', pitch: 69, startStep: 0, durationSteps: 2, velocity: 0.9 },
        { id: 'n2', pitch: 72, startStep: 2, durationSteps: 2, velocity: 0.8 },
        { id: 'n3', pitch: 76, startStep: 4, durationSteps: 4, velocity: 0.95 },
        { id: 'n4', pitch: 74, startStep: 8, durationSteps: 4, velocity: 0.85 },
        { id: 'n5', pitch: 71, startStep: 12, durationSteps: 4, velocity: 0.85 },
      ] },
      { id: 'trk_bass', name: 'Sub-Bass Kinetic Driver', role: 'Bass', instrument: 'sub_bass', volume: 0.85, pan: 0, mute: false, solo: false, notes: [
        { id: 'nb1', pitch: 45, startStep: 0, durationSteps: 4, velocity: 0.9 },
        { id: 'nb2', pitch: 45, startStep: 4, durationSteps: 4, velocity: 0.9 },
        { id: 'nb3', pitch: 48, startStep: 8, durationSteps: 4, velocity: 0.9 },
        { id: 'nb4', pitch: 43, startStep: 12, durationSteps: 4, velocity: 0.9 },
      ] },
      { id: 'trk_pad', name: 'Harmonic Atmospheric Pad', role: 'Harmony', instrument: 'synth_pad', volume: 0.6, pan: -0.2, mute: false, solo: false, notes: [
        { id: 'np1', pitch: 57, startStep: 0, durationSteps: 8, velocity: 0.7 },
        { id: 'np2', pitch: 60, startStep: 8, durationSteps: 8, velocity: 0.7 },
      ] },
    ],
  });
  const [activeTrackId, setActiveTrackId] = useState('trk_lead');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeTrack = project.tracks.find((track) => track.id === activeTrackId);
  const pitchRange = [76, 74, 72, 71, 69, 67, 65, 64, 62, 60, 57, 55, 53, 52, 48, 45];
  const midiNoteNames: Record<number, string> = { 76: 'E5', 74: 'D5', 72: 'C5', 71: 'B4', 69: 'A4', 67: 'G4', 65: 'F4', 64: 'E4', 62: 'D4', 60: 'C4', 57: 'A3', 55: 'G3', 53: 'F3', 52: 'E3', 48: 'C3', 45: 'A2' };

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass && !audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
    if (!isPlaying) return;

    const stepDurationMs = (60 / project.tempo / 4) * 1000;
    const timer = window.setInterval(() => {
      setCurrentStep((previous) => {
        const next = (previous + 1) % project.totalSteps;
        const ctx = audioCtxRef.current;
        if (ctx?.state === 'running') {
          const now = ctx.currentTime;
          for (const track of project.tracks) {
            if (track.mute) continue;
            for (const note of track.notes.filter((candidate) => candidate.startStep === next)) {
              const oscillator = ctx.createOscillator();
              const gain = ctx.createGain();
              oscillator.frequency.setValueAtTime(440 * Math.pow(2, (note.pitch - 69) / 12), now);
              oscillator.type = track.instrument === 'sub_bass' ? 'sine' : track.instrument === 'synth_pad' ? 'triangle' : 'sawtooth';
              const durationSec = note.durationSteps * (60 / project.tempo / 4);
              gain.gain.setValueAtTime(0.001, now);
              gain.gain.exponentialRampToValueAtTime(track.volume * note.velocity * 0.3, now + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
              oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(now); oscillator.stop(now + durationSec);
            }
          }
        }
        return next;
      });
    }, stepDurationMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, project]);

  useEffect(() => emergencyStop.registerAbortHandler(() => {
    setIsPlaying(false);
    void audioCtxRef.current?.suspend();
  }), []);

  const togglePlay = async () => {
    if (emergencyStop.isEmergencyStopped()) return;
    if (!isPlaying && audioCtxRef.current?.state === 'suspended') await audioCtxRef.current.resume();
    const next = !isPlaying;
    setIsPlaying(next);
    eventBus.emit('CORE_STATE_CHANGE', next ? 'MUSIC MODE' : 'IDLE');
  };

  const handleCellClick = (pitch: number, step: number) => {
    if (!activeTrack) return;
    const existingIndex = activeTrack.notes.findIndex((note) => note.pitch === pitch && note.startStep === step);
    if (existingIndex >= 0) {
      setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: track.notes.filter((_, index) => index !== existingIndex) } : track) }));
      return;
    }
    const newNote: NoteEvent = { id: `note_${activeTrackId}_${pitch}_${step}_${activeTrack.notes.length}`, pitch, startStep: step, durationSteps: 2, velocity: 0.85 };
    setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: [...track.notes, newNote] } : track) }));
  };

  return (
    <div className="flex h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <div className="flex-1 flex flex-col p-4 bg-[#0a0e17] overflow-hidden">
        <div className="flex items-center justify-between mb-3 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="p-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg shadow-md shadow-cyan-500/20 flex items-center gap-2 cursor-pointer">{isPlaying ? <Square size={14} /> : <Play size={14} />}<span>{isPlaying ? 'STOP' : 'PLAY'}</span></button>
            <button onClick={() => setCurrentStep(0)} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded cursor-pointer" title="Reset Playhead"><RotateCcw size={14} /></button>
            <div className="flex items-center gap-2 border-l border-gray-800 pl-3"><span className="text-gray-400">BPM:</span><input type="number" value={project.tempo} onChange={(event) => setProject((current) => ({ ...current, tempo: parseInt(event.target.value) || 120 }))} className="w-14 bg-[#141b2b] border border-gray-700 rounded px-1.5 py-0.5 text-white text-center text-xs" /></div>
            <div className="flex items-center gap-2 border-l border-gray-800 pl-3"><span className="text-gray-400">SCALE:</span><span className="text-cyan-300 font-bold">{project.key} {project.scale}</span></div>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/20 px-2 py-1 rounded border border-amber-500/30"><ShieldCheck size={12} /> LOCAL NOTE SEQUENCE // RIGHTS NOT ASSESSED</span>
        </div>

        <div className="flex-1 bg-[#090d16] rounded-xl border border-gray-800 flex overflow-hidden">
          <div className="w-16 bg-[#0c111c] border-r border-gray-800 flex flex-col">{pitchRange.map((pitch) => <div key={pitch} className="flex-1 flex items-center justify-end pr-2 border-b border-gray-800/40 font-bold text-[10px] text-gray-300">{midiNoteNames[pitch] || pitch}</div>)}</div>
          <div className="flex-1 flex flex-col overflow-x-auto">{pitchRange.map((pitch) => <div key={pitch} className="flex-1 flex border-b border-gray-800/40">{Array.from({ length: project.totalSteps }).map((_, stepIndex) => {
            const hasNote = activeTrack?.notes.some((note) => note.pitch === pitch && note.startStep === stepIndex);
            const isCurrent = currentStep === stepIndex && isPlaying;
            return <div key={stepIndex} onClick={() => handleCellClick(pitch, stepIndex)} className={`flex-1 border-r border-gray-800/40 cursor-pointer transition relative ${stepIndex % 4 === 0 ? 'border-r-gray-700' : ''} ${isCurrent ? 'bg-cyan-500/20' : hasNote ? 'bg-cyan-500' : 'hover:bg-gray-800/40'}`}>{hasNote && <div className="absolute inset-0 bg-cyan-400 border border-white rounded shadow-sm shadow-cyan-400" />}</div>;
          })}</div>)}</div>
        </div>
      </div>

      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 p-4 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3"><span className="text-gray-300 font-bold flex items-center gap-2"><Music size={14} className="text-cyan-400" /> MIO TRACK MIXER</span><span className="text-gray-500 text-[10px]">{project.tracks.length} TRACKS</span></div>
        <div className="space-y-3 flex-1 overflow-y-auto">{project.tracks.map((track) => <div key={track.id} onClick={() => setActiveTrackId(track.id)} className={`p-3 rounded-lg border cursor-pointer transition ${activeTrackId === track.id ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400 hover:border-gray-700'}`}>
          <div className="flex items-center justify-between mb-2"><span className="font-bold">{track.name}</span><span className="text-[10px] text-gray-400">{track.role}</span></div>
          <div className="space-y-1"><div className="flex justify-between text-[10px] text-gray-400"><span>Gain:</span><span>{Math.round(track.volume * 100)}%</span></div><input type="range" min="0" max="1" step="0.05" value={track.volume} onChange={(event) => { const volume = parseFloat(event.target.value); setProject((current) => ({ ...current, tracks: current.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, volume } : candidate) })); }} className="w-full accent-cyan-400" /></div>
          <div className="flex items-center justify-end gap-2 mt-2"><button onClick={(event) => { event.stopPropagation(); setProject((current) => ({ ...current, tracks: current.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, mute: !candidate.mute } : candidate) })); }} className={`px-2 py-0.5 rounded text-[10px] font-bold ${track.mute ? 'bg-red-500 text-black' : 'bg-gray-800 text-gray-400'}`}>{track.mute ? 'MUTED' : 'MUTE'}</button></div>
        </div>)}</div>
      </div>
    </div>
  );
};
