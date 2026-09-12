import React, { useState, useRef, useEffect } from 'react';
import { MioSFXPatch, SFXLayer } from '../../types/creative';
import { ExportManager } from '../../project/ExportManager';
import { Volume2, Play, Download, Plus, ShieldCheck, Activity, Sliders } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { emergencyStop } from '../../core/EmergencyStop';

export const SFXStudioView: React.FC = () => {
  const [patch, setPatch] = useState<MioSFXPatch>({
    name: 'Cyber_Plasma_Discharge',
    category: 'LASER',
    duration: 1.4,
    layers: [
      {
        id: 'layer_transient',
        name: 'Transient Click Attack',
        type: 'transient',
        waveType: 'sawtooth',
        baseFrequency: 1200,
        frequencySweep: 80,
        attack: 0.005,
        decay: 0.15,
        sustain: 0.05,
        release: 0.1,
        filterCutoff: 4500,
        filterResonance: 6,
        distortion: 0.3,
        delayTime: 0.08,
        delayFeedback: 0.25,
        reverbMix: 0.15,
        volume: 0.8,
      },
      {
        id: 'layer_sub_body',
        name: 'Sub-Bass Kinetic Impact',
        type: 'sub_harmonic',
        waveType: 'sine',
        baseFrequency: 180,
        frequencySweep: 45,
        attack: 0.02,
        decay: 0.4,
        sustain: 0.2,
        release: 0.6,
        filterCutoff: 600,
        filterResonance: 2,
        distortion: 0.1,
        delayTime: 0.0,
        delayFeedback: 0.0,
        reverbMix: 0.25,
        volume: 0.9,
      },
    ],
  });

  const [selectedLayerId, setSelectedLayerId] = useState<string>('layer_transient');
  const selectedLayer = patch.layers.find((l) => l.id === selectedLayerId);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize Web Audio Context
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    }

    // Oscilloscope Animation Loop
    let animId: number;
    const renderWaveform = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      if (canvas && analyser) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteTimeDomainData(dataArray);

          ctx.fillStyle = '#07090e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.lineWidth = 2;
          ctx.strokeStyle = '#00f0ff';
          ctx.beginPath();

          const sliceWidth = (canvas.width * 1.0) / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
          }

          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
        }
      }
      animId = requestAnimationFrame(renderWaveform);
    };

    renderWaveform();

    // Register emergency abort
    const unregisterAbort = emergencyStop.registerAbortHandler(() => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend();
      }
    });

    return () => {
      cancelAnimationFrame(animId);
      unregisterAbort();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Synthesize and play audio nodes
  const playSound = async () => {
    if (emergencyStop.isEmergencyStopped()) return;

    let ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.7, now);

    if (analyserRef.current) {
      masterGain.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
    } else {
      masterGain.connect(ctx.destination);
    }

    eventBus.emit('CORE_STATE_CHANGE', 'SFX MODE');

    patch.layers.forEach((layer) => {
      if (!ctx) return;

      // 1. Oscillator
      const osc = ctx.createOscillator();
      osc.type = layer.waveType;
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, layer.frequencySweep), now + patch.duration);

      // 2. Filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(layer.filterCutoff, now);
      filter.Q.setValueAtTime(layer.filterResonance, now);

      // 3. Envelope Gain
      const envGain = ctx.createGain();
      envGain.gain.setValueAtTime(0.0001, now);
      // Attack
      envGain.gain.exponentialRampToValueAtTime(Math.max(0.001, layer.volume), now + layer.attack);
      // Decay & Sustain
      envGain.gain.exponentialRampToValueAtTime(Math.max(0.001, layer.volume * layer.sustain), now + layer.attack + layer.decay);
      // Release
      envGain.gain.exponentialRampToValueAtTime(0.0001, now + patch.duration);

      // Node Graph Connections
      osc.connect(filter);
      filter.connect(envGain);
      envGain.connect(masterGain);

      osc.start(now);
      osc.stop(now + patch.duration);
    });

    setTimeout(() => {
      if (!emergencyStop.isEmergencyStopped()) {
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      }
    }, patch.duration * 1000);
  };

  const updateSelectedLayer = (updates: Partial<SFXLayer>) => {
    if (!selectedLayerId) return;
    setPatch((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l)),
    }));
  };

  const handleExportWAV = () => {
    // Generate an offline audio buffer for export
    const offlineCtx = new OfflineAudioContext(1, 44100 * patch.duration, 44100);
    const now = 0;
    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(0.8, now);
    masterGain.connect(offlineCtx.destination);

    patch.layers.forEach((layer) => {
      const osc = offlineCtx.createOscillator();
      osc.type = layer.waveType;
      osc.frequency.setValueAtTime(layer.baseFrequency, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, layer.frequencySweep), now + patch.duration);

      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(layer.filterCutoff, now);

      const envGain = offlineCtx.createGain();
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.exponentialRampToValueAtTime(Math.max(0.001, layer.volume), now + layer.attack);
      envGain.gain.exponentialRampToValueAtTime(0.0001, now + patch.duration);

      osc.connect(filter);
      filter.connect(envGain);
      envGain.connect(masterGain);

      osc.start(now);
      osc.stop(now + patch.duration);
    });

    offlineCtx.startRendering().then((renderedBuffer) => {
      ExportManager.exportAudioAsWAV(renderedBuffer, `${patch.name}.wav`);
    });
  };

  return (
    <div className="flex h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      {/* Synthesizer Workspace */}
      <div className="flex-1 flex flex-col p-4 bg-[#0a0e17] overflow-y-auto">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-cyan-300">
            <Volume2 size={16} />
            <span className="font-bold text-sm">SFX ENGINE // PROCEDURAL AUDIO SYNTHESIZER</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[10px] ml-2">
              <ShieldCheck size={12} /> VERIFIED
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={playSound}
              className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              <Play size={14} /> TRIGGER SFX
            </button>
            <button
              onClick={handleExportWAV}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded flex items-center gap-1.5 border border-gray-700 cursor-pointer"
            >
              <Download size={13} /> Export WAV
            </button>
          </div>
        </div>

        {/* Real-time Oscilloscope */}
        <div className="bg-[#0b101c] p-4 rounded-xl border border-cyan-500/30 mb-4 shadow-xl">
          <div className="flex items-center justify-between text-gray-400 text-[10px] mb-2">
            <span className="flex items-center gap-1">
              <Activity size={12} className="text-cyan-400" /> REAL-TIME OSCILLOSCOPE
            </span>
            <span>Duration: {patch.duration}s</span>
          </div>
          <canvas ref={canvasRef} width={600} height={100} className="w-full h-24 rounded bg-black" />
        </div>

        {/* Sound Layer Stack */}
        <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-300 font-bold flex items-center gap-2">
              <Sliders size={14} className="text-cyan-400" /> AUDIO SYNTHESIS LAYERS ({patch.layers.length})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {patch.layers.map((layer) => (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`p-3 rounded-lg border cursor-pointer transition ${
                  selectedLayerId === layer.id
                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300'
                    : 'bg-[#111726] border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">{layer.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 uppercase">
                    {layer.waveType}
                  </span>
                </div>
                <div className="grid grid-cols-2 text-[10px] text-gray-400 gap-1">
                  <span>Base Freq: {layer.baseFrequency}Hz</span>
                  <span>Sweep: {layer.frequencySweep}Hz</span>
                  <span>Cutoff: {layer.filterCutoff}Hz</span>
                  <span>Volume: {Math.round(layer.volume * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Layer Parameter Inspector */}
      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 p-4 flex flex-col overflow-y-auto space-y-4">
        {selectedLayer ? (
          <>
            <div className="border-b border-gray-800 pb-3">
              <span className="text-gray-400 text-[10px] block">ACTIVE SYNTH LAYER</span>
              <span className="text-cyan-300 font-bold text-sm">{selectedLayer.name}</span>
            </div>

            {/* Oscillator & Waveform */}
            <div>
              <span className="text-cyan-400 font-bold block text-[11px] mb-2">OSCILLATOR &amp; PITCH</span>
              <div className="space-y-2">
                <div>
                  <span className="text-gray-400 text-[10px] block mb-1">Waveform:</span>
                  <select
                    value={selectedLayer.waveType}
                    onChange={(e) => updateSelectedLayer({ waveType: e.target.value as OscillatorType })}
                    className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white text-xs"
                  >
                    <option value="sawtooth">Sawtooth (Aggressive / Cyber)</option>
                    <option value="square">Square (Digital / 8-Bit)</option>
                    <option value="sine">Sine (Sub / Pure Tone)</option>
                    <option value="triangle">Triangle (Soft / Hollow)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-gray-400 text-[10px]">
                    <span>Start Pitch:</span>
                    <span>{selectedLayer.baseFrequency} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="3000"
                    value={selectedLayer.baseFrequency}
                    onChange={(e) => updateSelectedLayer({ baseFrequency: parseInt(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-gray-400 text-[10px]">
                    <span>Pitch Sweep Target:</span>
                    <span>{selectedLayer.frequencySweep} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="3000"
                    value={selectedLayer.frequencySweep}
                    onChange={(e) => updateSelectedLayer({ frequencySweep: parseInt(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* Envelope ADSR */}
            <div className="border-t border-gray-800 pt-3">
              <span className="text-cyan-400 font-bold block text-[11px] mb-2">ADSR ENVELOPE</span>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-gray-400 text-[10px]">
                    <span>Attack:</span>
                    <span>{selectedLayer.attack.toFixed(3)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.001"
                    max="0.5"
                    step="0.005"
                    value={selectedLayer.attack}
                    onChange={(e) => updateSelectedLayer({ attack: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-gray-400 text-[10px]">
                    <span>Decay:</span>
                    <span>{selectedLayer.decay.toFixed(2)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="1"
                    step="0.01"
                    value={selectedLayer.decay}
                    onChange={(e) => updateSelectedLayer({ decay: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* Filter */}
            <div className="border-t border-gray-800 pt-3">
              <span className="text-cyan-400 font-bold block text-[11px] mb-2">BIQUAD FILTER</span>
              <div>
                <div className="flex justify-between text-gray-400 text-[10px]">
                  <span>Cutoff Frequency:</span>
                  <span>{selectedLayer.filterCutoff} Hz</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="10000"
                  step="50"
                  value={selectedLayer.filterCutoff}
                  onChange={(e) => updateSelectedLayer({ filterCutoff: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="text-gray-500 text-center p-4">Select a sound layer</div>
        )}
      </div>
    </div>
  );
};
