import type { MioVoiceActivityDetector, MioVoiceActivityEvent } from './MioVoiceTurnManager';

export interface WebAudioVadOptions {
  threshold?: number;
  attackFrames?: number;
  releaseFrames?: number;
  sampleIntervalMs?: number;
}

/** Lightweight browser VAD for barge-in. It detects energy only; no audio is stored or transmitted. */
export class WebAudioVoiceActivityDetector implements MioVoiceActivityDetector {
  readonly id = 'web-audio-energy-vad';
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private analyser: AnalyserNode | null = null;
  private active = false;
  private attackCount = 0;
  private releaseCount = 0;

  constructor(private readonly options: WebAudioVadOptions = {}) {}

  async start(onActivity: (event: MioVoiceActivityEvent) => void, signal?: AbortSignal): Promise<void> {
    await this.stop();
    if (signal?.aborted) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not available in this environment.');
    }
    const AudioContextCtor = globalThis.AudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio API is not available in this environment.');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (signal?.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const context = new AudioContextCtor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    context.createMediaStreamSource(stream).connect(analyser);
    this.stream = stream;
    this.context = context;
    this.analyser = analyser;

    const samples = new Float32Array(analyser.fftSize);
    const threshold = this.options.threshold ?? 0.035;
    const attackFrames = this.options.attackFrames ?? 2;
    const releaseFrames = this.options.releaseFrames ?? 5;
    const interval = this.options.sampleIntervalMs ?? 50;

    const sample = () => {
      if (!this.analyser || signal?.aborted) return;
      this.analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      const rms = Math.sqrt(sum / samples.length);
      const voiced = rms >= threshold;
      if (voiced) { this.attackCount += 1; this.releaseCount = 0; }
      else { this.releaseCount += 1; this.attackCount = 0; }

      const nextActive = this.active ? this.releaseCount < releaseFrames : this.attackCount >= attackFrames;
      if (nextActive !== this.active) {
        this.active = nextActive;
        onActivity({ active: this.active, level: rms, timestamp: Date.now() });
      }
    };

    this.timer = setInterval(sample, interval);
    signal?.addEventListener('abort', () => { void this.stop(); }, { once: true });
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.analyser = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context) await this.context.close().catch(() => undefined);
    this.context = null;
    this.active = false;
    this.attackCount = 0;
    this.releaseCount = 0;
  }
}

export const webAudioVoiceActivityDetector = new WebAudioVoiceActivityDetector();
