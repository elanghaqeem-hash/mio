import React, { useEffect, useRef, useState } from 'react';
import { Activity, Download, Play, Plus, ShieldCheck, Sliders, Trash2, Volume2 } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { emergencyStop } from '../../core/EmergencyStop';
import { ExportManager } from '../../project/ExportManager';
import type { MioSFXPatch, SFXLayer } from '../../types/creative';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';
import { envelopeTimes, normalizeSFXPatch, type SFXAutomationLane, type SFXAutomatableParameter, normalizeAutomationLane, evaluateAutomationLane } from '../../creative/AudioWorkspace';

const INITIAL_LAYERS: SFXLayer[] = [
  {
    id: 'layer_transient', name: 'Transient Click Attack', type: 'transient', waveType: 'sawtooth',
    baseFrequency: 1200, frequencySweep: 80, attack: 0.005, decay: 0.15, sustain: 0.05, release: 0.1,
    filterCutoff: 4500, filterResonance: 6, distortion: 0.3, delayTime: 0.08, delayFeedback: 0.25,
    reverbMix: 0.15, volume: 0.8,
  },
  {
    id: 'layer_sub_body', name: 'Sub-Bass Kinetic Impact', type: 'sub_harmonic', waveType: 'sine',
    baseFrequency: 180, frequencySweep: 45, attack: 0.02, decay: 0.4, sustain: 0.2, release: 0.6,
    filterCutoff: 600, filterResonance: 2, distortion: 0.1, delayTime: 0, delayFeedback: 0,
    reverbMix: 0.25, volume: 0.9,
  },
];

const createLayer = (sequence: number): SFXLayer => ({
  id: `layer_custom_${sequence}`,
  name: `Custom Layer ${sequence}`,
  type: 'transient',
  waveType: 'sine',
  baseFrequency: 440,
  frequencySweep: 220,
  attack: 0.01,
  decay: 0.2,
  sustain: 0.3,
  release: 0.3,
  filterCutoff: 3200,
  filterResonance: 2,
  distortion: 0,
  delayTime: 0,
  delayFeedback: 0,
  reverbMix: 0.1,
  volume: 0.7,
});

const INITIAL_PATCH: MioSFXPatch = { name: 'Cyber_Plasma_Discharge', category: 'LASER', duration: 1.4, layers: INITIAL_LAYERS };

export const SFXStudioView: React.FC = () => {
  const workspace = useCreativeStudioDocument<MioSFXPatch>('MIO_SFX_Patch.miosfx', INITIAL_PATCH);
  const { state: patch, setState: setPatch } = workspace;
  const [selectedLayerId, setSelectedLayerId] = useState(INITIAL_LAYERS[0].id);
  const [automationParameter, setAutomationParameter] = useState<SFXAutomatableParameter>('filterCutoff');
  const [automationLanes, setAutomationLanes] = useState<SFXAutomationLane[]>([]);
  const [selectedAutomationTime, setSelectedAutomationTime] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const automationCanvasRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const selectedLayer = patch.layers.find((layer) => layer.id === selectedLayerId);

  useEffect(() => {
    const AudioContextCtor = window.AudioContext;
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioCtxRef.current = audioContext;
    analyserRef.current = analyser;

    let frameId = 0;
    const renderWaveform = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          const samples = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteTimeDomainData(samples);
          context.fillStyle = '#07090e';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.lineWidth = 2;
          context.strokeStyle = '#00f0ff';
          context.beginPath();
          samples.forEach((sample, index) => {
            const x = (index / Math.max(1, samples.length - 1)) * canvas.width;
            const y = (sample / 255) * canvas.height;
            if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
          });
          context.stroke();
        }
      }
      frameId = requestAnimationFrame(renderWaveform);
    };
    renderWaveform();

    const unregisterAbort = emergencyStop.registerAbortHandler(() => {
      if (audioContext.state === 'running') void audioContext.suspend();
    });

    return () => {
      cancelAnimationFrame(frameId);
      unregisterAbort();
      analyser.disconnect();
      void audioContext.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, []);

  const activeAutomation = automationLanes.find((lane) => lane.layerId === selectedLayerId && lane.parameter === automationParameter);

  const addAutomationPoint = (time: number, value: number) => {
    const lane = normalizeAutomationLane({ layerId: selectedLayerId, parameter: automationParameter, points: [...(activeAutomation?.points ?? []), { time, value }] }, patch.duration);
    setAutomationLanes((current) => [...current.filter((candidate) => !(candidate.layerId === selectedLayerId && candidate.parameter === automationParameter)), lane]);
  };

  const automationRange = (parameter: SFXAutomatableParameter): [number, number] => parameter === 'filterCutoff' || parameter === 'baseFrequency' || parameter === 'frequencySweep' ? [20, 20000] : parameter === 'filterResonance' ? [0, 30] : parameter === 'delayTime' ? [0, 2] : [0, 1];
  const authorAutomationAtPointer = (clientX: number, clientY: number) => {
    const rect = automationCanvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const [min, max] = automationRange(automationParameter); addAutomationPoint(x * patch.duration, max - y * (max - min));
  };

  const removeSelectedAutomationPoint = () => {
    if (selectedAutomationTime === null) return;
    setAutomationLanes((current) => current.map((lane) => lane.layerId === selectedLayerId && lane.parameter === automationParameter ? { ...lane, points: lane.points.filter((point) => Math.abs(point.time - selectedAutomationTime) > 0.0001) } : lane));
    setSelectedAutomationTime(null);
  };

  const updateSelectedLayer = (updates: Partial<SFXLayer>) => {
    setPatch((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === selectedLayerId ? { ...layer, ...updates } : layer),
    }));
  };

  const addLayer = () => {
    const layer = createLayer(patch.layers.length + 1);
    setPatch((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const removeLayer = (layerId: string) => {
    setPatch((current) => {
      if (current.layers.length <= 1) return current;
      const layers = current.layers.filter((layer) => layer.id !== layerId);
      if (selectedLayerId === layerId) setSelectedLayerId(layers[0].id);
      return { ...current, layers };
    });
  };

  const scheduleAutomation = (param: AudioParam, layerId: string, parameter: SFXAutomatableParameter, fallback: number, startTime: number, duration: number) => {
    const lane = automationLanes.find((candidate) => candidate.layerId === layerId && candidate.parameter === parameter);
    param.cancelScheduledValues(startTime);
    if (!lane?.points.length) { param.setValueAtTime(fallback, startTime); return; }
    const normalized = normalizeAutomationLane(lane, duration);
    param.setValueAtTime(evaluateAutomationLane(normalized, 0, fallback), startTime);
    normalized.points.forEach((point) => param.linearRampToValueAtTime(point.value, startTime + point.time));
  };

  const buildLayerGraph = (context: BaseAudioContext, layer: SFXLayer, destination: AudioNode, startTime: number, duration: number) => {
    const oscillator = context.createOscillator();
    let source: AudioScheduledSourceNode = oscillator;
    if (layer.type === 'noise') {
      const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
      const buffer = context.createBuffer(1, frameCount, context.sampleRate);
      const data = buffer.getChannelData(0);
      // Deterministic xorshift noise keeps live/offline synthesis reproducible for the same layer.
      let seed = Array.from(layer.id).reduce((value, char) => ((value * 31) ^ char.charCodeAt(0)) >>> 0, 0x9e3779b9) || 1;
      for (let index = 0; index < data.length; index += 1) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; data[index] = ((seed >>> 0) / 0xffffffff) * 2 - 1; }
      const bufferSource = context.createBufferSource(); bufferSource.buffer = buffer; source = bufferSource;
    }
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const distortion = context.createWaveShaper();
    const dry = context.createGain();
    const delay = context.createDelay(2);
    const feedback = context.createGain();
    const wet = context.createGain();
    oscillator.type = layer.waveType;
    if (layer.type !== 'noise') { scheduleAutomation(oscillator.frequency, layer.id, 'baseFrequency', Math.max(20, layer.baseFrequency), startTime, duration); if (!automationLanes.some((lane) => lane.layerId === layer.id && lane.parameter === 'baseFrequency' && lane.points.length)) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, layer.frequencySweep), startTime + duration); }
    filter.type = 'lowpass';
    scheduleAutomation(filter.frequency, layer.id, 'filterCutoff', layer.filterCutoff, startTime, duration);
    scheduleAutomation(filter.Q, layer.id, 'filterResonance', layer.filterResonance, startTime, duration);
    const times = envelopeTimes(layer, startTime, duration);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, layer.volume), times.attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, layer.volume * layer.sustain), times.decay);
    envelope.gain.setValueAtTime(Math.max(0.001, layer.volume * layer.sustain), times.sustain);
    envelope.gain.exponentialRampToValueAtTime(0.0001, times.end);
    const amount = Math.max(0, layer.distortion) * 80;
    distortion.curve = new Float32Array(Array.from({ length: 256 }, (_, index) => { const x = index * 2 / 255 - 1; return ((3 + amount) * x * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(x)); }));
    distortion.oversample = '2x'; dry.gain.setValueAtTime(1 - layer.reverbMix * .4, startTime); wet.gain.setValueAtTime(layer.reverbMix, startTime);
    scheduleAutomation(delay.delayTime, layer.id, 'delayTime', layer.delayTime, startTime, duration); scheduleAutomation(feedback.gain, layer.id, 'delayFeedback', Math.min(.85, layer.delayFeedback), startTime, duration); scheduleAutomation(wet.gain, layer.id, 'reverbMix', layer.reverbMix, startTime, duration);
    source.connect(filter);
    filter.connect(distortion); distortion.connect(envelope); envelope.connect(dry); dry.connect(destination); envelope.connect(delay); delay.connect(wet); wet.connect(destination); delay.connect(feedback); feedback.connect(delay);
    source.start(startTime);
    source.stop(startTime + duration);
  };

  const playSound = async () => {
    if (emergencyStop.isEmergencyStopped()) return;
    const context = audioCtxRef.current;
    const analyser = analyserRef.current;
    if (!context || !analyser) return;
    if (context.state === 'suspended') await context.resume();
    const master = context.createGain();
    master.gain.setValueAtTime(0.7, context.currentTime);
    master.connect(analyser);
    analyser.connect(context.destination);
    normalizeSFXPatch(patch).layers.forEach((layer) => buildLayerGraph(context, layer, master, context.currentTime, patch.duration));
    eventBus.emit('CORE_STATE_CHANGE', 'SFX MODE');
    window.setTimeout(() => {
      if (!emergencyStop.isEmergencyStopped()) eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      master.disconnect();
      analyser.disconnect();
    }, patch.duration * 1000 + 100);
  };

  const exportWav = async () => {
    const offline = new OfflineAudioContext(1, Math.ceil(44100 * patch.duration), 44100);
    const master = offline.createGain();
    master.gain.setValueAtTime(0.8, 0);
    master.connect(offline.destination);
    normalizeSFXPatch(patch).layers.forEach((layer) => buildLayerGraph(offline, layer, master, 0, patch.duration));
    ExportManager.exportAudioAsWAV(await offline.startRendering(), `${patch.name}.wav`);
  };

  const slider = (label: string, value: number, min: number, max: number, step: number, field: keyof SFXLayer, suffix = '') => (
    <label className="block">
      <span className="mb-1 flex justify-between text-[10px] text-gray-400"><span>{label}</span><span>{value}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => updateSelectedLayer({ [field]: Number(event.target.value) })} className="w-full accent-cyan-400" />
    </label>
  );

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[#07090e] font-mono text-xs">
      <CreativeWorkspaceToolbar workspace={workspace} />
      <section className="flex flex-1 flex-col overflow-y-auto bg-[#0a0e17] p-4">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-300"><Volume2 size={16} /><span className="font-bold text-sm">SFX ENGINE // PROCEDURAL AUDIO SYNTHESIZER</span><span className="ml-2 flex items-center gap-1 text-[10px] text-emerald-400"><ShieldCheck size={12} /> LOCAL SYNTH</span></div>
          <div className="flex gap-2">
            <button onClick={() => void playSound()} className="flex items-center gap-2 rounded bg-cyan-500 px-4 py-1.5 font-bold text-black hover:bg-cyan-400"><Play size={14} /> TRIGGER SFX</button>
            <button onClick={() => void exportWav()} className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-gray-200 hover:bg-gray-700"><Download size={13} /> Export WAV</button>
          </div>
        </header>

        <div className="mb-4 rounded-xl border border-cyan-500/30 bg-[#0b101c] p-4">
          <div className="mb-2 flex justify-between text-[10px] text-gray-400"><span className="flex items-center gap-1"><Activity size={12} className="text-cyan-400" /> REAL-TIME OSCILLOSCOPE</span><span>Duration {patch.duration}s</span></div>
          <canvas ref={canvasRef} width={600} height={100} className="h-24 w-full rounded bg-black" />
        </div>

        <div className="flex-1 rounded-xl border border-gray-800 bg-[#0d121d] p-4">
          <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-gray-300"><Sliders size={14} className="text-cyan-400" /> AUDIO LAYERS ({patch.layers.length})</span><button onClick={addLayer} className="flex items-center gap-1 rounded border border-cyan-500/30 px-2 py-1 text-[10px] text-cyan-300"><Plus size={11} /> ADD LAYER</button></div>
          <div className="grid gap-3 md:grid-cols-2">{patch.layers.map((layer) => (
            <button key={layer.id} onClick={() => setSelectedLayerId(layer.id)} className={`rounded-lg border p-3 text-left ${selectedLayerId === layer.id ? 'border-cyan-500/60 bg-cyan-950/40' : 'border-gray-800 bg-[#111726]'}`}>
              <div className="mb-2 flex justify-between"><span className="font-bold text-gray-200">{layer.name}</span><span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] uppercase text-gray-300">{layer.waveType}</span></div>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500"><span>Base {layer.baseFrequency}Hz</span><span>Sweep {layer.frequencySweep}Hz</span><span>Cutoff {layer.filterCutoff}Hz</span><span>Vol {Math.round(layer.volume * 100)}%</span></div>
            </button>
          ))}</div>
        </div>
      </section>

      <aside className="flex h-full w-80 flex-col space-y-4 overflow-y-auto border-l border-gray-800 bg-[#0d121d] p-4">
        {selectedLayer ? <>
          <div className="flex items-start justify-between border-b border-gray-800 pb-3"><div><span className="block text-[10px] text-gray-500">ACTIVE SYNTH LAYER</span><span className="font-bold text-cyan-300">{selectedLayer.name}</span></div>{patch.layers.length > 1 && <button onClick={() => removeLayer(selectedLayer.id)} className="rounded border border-rose-500/20 p-1.5 text-rose-300" title="Remove layer"><Trash2 size={12} /></button>}</div>
          <label><span className="mb-1 block text-[10px] text-gray-400">LAYER TYPE</span><select value={selectedLayer.type} onChange={(event) => updateSelectedLayer({ type: event.target.value as SFXLayer['type'] })} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white"><option value="transient">Transient</option><option value="oscillator">Oscillator</option><option value="noise">Noise</option><option value="sub_harmonic">Sub Harmonic</option></select></label><label><span className="mb-1 block text-[10px] text-gray-400">WAVEFORM</span><select value={selectedLayer.waveType} onChange={(event) => updateSelectedLayer({ waveType: event.target.value as OscillatorType })} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white"><option value="sine">Sine</option><option value="triangle">Triangle</option><option value="sawtooth">Sawtooth</option><option value="square">Square</option></select></label>
          {slider('START PITCH', selectedLayer.baseFrequency, 30, 3000, 1, 'baseFrequency', ' Hz')}
          {slider('SWEEP TARGET', selectedLayer.frequencySweep, 20, 3000, 1, 'frequencySweep', ' Hz')}
          {slider('ATTACK', selectedLayer.attack, 0.001, 0.5, 0.005, 'attack', ' s')}
          {slider('DECAY', selectedLayer.decay, 0.01, 1, 0.01, 'decay', ' s')}
          {slider('SUSTAIN', selectedLayer.sustain, 0.01, 1, 0.01, 'sustain')}
          {slider('RELEASE', selectedLayer.release, 0.01, 2, 0.01, 'release', ' s')}
          {slider('FILTER CUTOFF', selectedLayer.filterCutoff, 50, 10000, 50, 'filterCutoff', ' Hz')}
          {slider('RESONANCE', selectedLayer.filterResonance, 0, 20, 0.1, 'filterResonance')}
          {slider('DISTORTION', selectedLayer.distortion, 0, 1, 0.01, 'distortion')}
          {slider('DELAY TIME', selectedLayer.delayTime, 0, 1, 0.01, 'delayTime', ' s')}
          {slider('DELAY FEEDBACK', selectedLayer.delayFeedback, 0, 0.85, 0.01, 'delayFeedback')}
          {slider('SPACE MIX', selectedLayer.reverbMix, 0, 1, 0.01, 'reverbMix')}
          {slider('VOLUME', selectedLayer.volume, 0.01, 1, 0.01, 'volume')}
          <div className="space-y-2 border-t border-gray-800 pt-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-cyan-300">AUTOMATION</span><span className="flex items-center gap-2 text-[9px] text-gray-500">{activeAutomation?.points.length ?? 0} POINTS{selectedAutomationTime !== null && <button onClick={removeSelectedAutomationPoint} className="rounded border border-rose-500/30 px-1 text-rose-300">DELETE</button>}</span></div><select value={automationParameter} onChange={(event) => setAutomationParameter(event.target.value as SFXAutomatableParameter)} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white"><option value="filterCutoff">Filter Cutoff</option><option value="baseFrequency">Base Frequency</option><option value="distortion">Distortion</option><option value="reverbMix">Space Mix</option><option value="volume">Volume</option></select><div className="grid grid-cols-3 gap-1"><button onClick={() => addAutomationPoint(0, selectedLayer[automationParameter] as number)} className="rounded bg-gray-800 py-1">START</button><button onClick={() => addAutomationPoint(patch.duration / 2, selectedLayer[automationParameter] as number)} className="rounded bg-gray-800 py-1">MID</button><button onClick={() => addAutomationPoint(patch.duration, selectedLayer[automationParameter] as number)} className="rounded bg-gray-800 py-1">END</button></div>{activeAutomation && <div className="text-[9px] text-gray-500">Preview @ 50%: {evaluateAutomationLane(activeAutomation, patch.duration / 2, selectedLayer[automationParameter] as number).toFixed(2)}</div>}<div ref={automationCanvasRef} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); authorAutomationAtPointer(event.clientX, event.clientY); }} onPointerMove={(event) => { if (event.buttons || event.pointerType === 'touch') authorAutomationAtPointer(event.clientX, event.clientY); }} className="relative h-28 touch-none overflow-hidden rounded border border-gray-700 bg-[#080c14] cursor-crosshair">{activeAutomation?.points.map((point, index) => { const [min,max]=automationRange(automationParameter); const left=(point.time/Math.max(.001,patch.duration))*100; const top=(1-(point.value-min)/Math.max(.001,max-min))*100; return <button key={`${point.time}-${index}`} onPointerDown={(event) => { event.stopPropagation(); setSelectedAutomationTime(point.time); }} aria-label={`Automation point ${index + 1}`} className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border ${selectedAutomationTime === point.time ? 'border-white bg-cyan-200' : 'border-cyan-200 bg-cyan-400'} shadow shadow-cyan-400`} style={{left:`${left}%`,top:`${Math.max(0,Math.min(100,top))}%`}} />; })}<span className="absolute bottom-1 left-1 text-[8px] text-gray-600">TOUCH / DRAG TO AUTHOR</span></div></div>
        </> : <div className="m-auto text-gray-500">Select a sound layer.</div>}
      </aside>
    </div>
  );
};
