import { mioVoice } from '../MioVoiceService';
import type { MioSpeechRequest, MioTranscriptionRequest, MioTranscriptionResult, MioVoiceProvider, MioVoiceProviderStatus } from './MioVoiceProvider';

type BrowserRecognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: any) => void) | null; onerror: ((event?: any) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort?(): void; };
type BrowserRecognitionConstructor = new () => BrowserRecognition;
function recognitionConstructor(): BrowserRecognitionConstructor | null { if (typeof window === 'undefined') return null; const speechWindow = window as typeof window & { SpeechRecognition?: BrowserRecognitionConstructor; webkitSpeechRecognition?: BrowserRecognitionConstructor; }; return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null; }

/** Local browser/device adapter. It is intentionally provider-neutral to Chat Studio. */
export class DeviceVoiceProvider implements MioVoiceProvider {
  readonly id = 'device-web-speech'; readonly kind = 'DEVICE' as const;
  private recognition: BrowserRecognition | null = null;
  private recognitionFinish: ((error?: unknown) => void) | null = null;

  status(): MioVoiceProviderStatus {
    const tts = mioVoice.isAvailable(); const stt = Boolean(recognitionConstructor()); const capabilities: MioVoiceProviderStatus['capabilities'] = [];
    if (tts) capabilities.push('TTS', 'INTERRUPT'); if (stt) capabilities.push('STT', 'INTERRUPT');
    return { id: this.id, kind: this.kind, available: tts || stt, capabilities, reason: tts || stt ? undefined : 'Browser speech APIs are unavailable on this device.' };
  }

  async speak(request: MioSpeechRequest): Promise<void> {
    if (request.signal?.aborted) throw new DOMException('Voice request aborted.', 'AbortError');
    await new Promise<void>((resolve, reject) => {
      let speakingObserved = false; let settled = false;
      const finish = (error?: unknown) => { if (settled) return; settled = true; unsubscribe(); request.signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
      const unsubscribe = mioVoice.subscribe((state) => { if (state === 'SPEAKING') speakingObserved = true; if (state === 'IDLE' && speakingObserved) finish(); });
      const abort = () => { mioVoice.stop(); finish(new DOMException('Voice request aborted.', 'AbortError')); };
      request.signal?.addEventListener('abort', abort, { once: true });
      const started = mioVoice.speak(request.text, request.locale, request.prosody); if (!started) finish(new Error('Device speech synthesis is unavailable.')); else if (request.signal?.aborted) abort();
    });
  }

  stopSpeaking(): void { mioVoice.stop(); }

  async startListening(request: MioTranscriptionRequest, onResult: (result: MioTranscriptionResult) => void): Promise<void> {
    const Recognition = recognitionConstructor(); if (!Recognition) throw new Error('Device speech recognition is unavailable.');
    await this.stopListening(); if (request.signal?.aborted) throw new DOMException('Recognition request aborted.', 'AbortError');
    const recognition = new Recognition(); this.recognition = recognition; recognition.lang = request.locale; recognition.continuous = false; recognition.interimResults = true;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return; settled = true; request.signal?.removeEventListener('abort', abort);
        if (this.recognition === recognition) this.recognition = null; if (this.recognitionFinish === finish) this.recognitionFinish = null;
        recognition.onresult = null; recognition.onerror = null; recognition.onend = null; error ? reject(error) : resolve();
      };
      const abort = () => { try { recognition.abort?.(); } catch {} finish(new DOMException('Recognition request aborted.', 'AbortError')); };
      this.recognitionFinish = finish;
      recognition.onresult = (event: any) => {
        if (this.recognition !== recognition || settled) return;
        const result = event.results?.[event.resultIndex ?? 0]; const text = result?.[0]?.transcript?.trim?.() ?? ''; if (!text) return;
        onResult({ text, locale: request.locale, final: Boolean(result.isFinal) });
      };
      recognition.onerror = (event?: any) => {
        if (request.signal?.aborted || event?.error === 'aborted') finish(new DOMException('Recognition request aborted.', 'AbortError'));
        else finish(new Error(event?.error ? `Device speech recognition failed: ${event.error}.` : 'Device speech recognition failed.'));
      };
      recognition.onend = () => { if (request.signal?.aborted) finish(new DOMException('Recognition request aborted.', 'AbortError')); else finish(); };
      request.signal?.addEventListener('abort', abort, { once: true });
      try { recognition.start(); } catch (error) { finish(error); }
    });
  }

  async stopListening(): Promise<void> {
    const recognition = this.recognition; const finish = this.recognitionFinish;
    if (!recognition) { finish?.(); return; }
    try { recognition.stop(); } catch {}
    finish?.();
  }
}

export const deviceVoiceProvider = new DeviceVoiceProvider();
