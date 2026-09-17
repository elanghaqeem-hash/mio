import { mioVoice } from '../MioVoiceService';
import type {
  MioSpeechRequest,
  MioTranscriptionRequest,
  MioTranscriptionResult,
  MioVoiceProvider,
  MioVoiceProviderStatus,
} from './MioVoiceProvider';

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

function recognitionConstructor(): BrowserRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserRecognitionConstructor;
    webkitSpeechRecognition?: BrowserRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

/** Local browser/device adapter. It is intentionally provider-neutral to Chat Studio. */
export class DeviceVoiceProvider implements MioVoiceProvider {
  readonly id = 'device-web-speech';
  readonly kind = 'DEVICE' as const;
  private recognition: BrowserRecognition | null = null;
  private abortCleanup: (() => void) | null = null;

  status(): MioVoiceProviderStatus {
    const tts = mioVoice.isAvailable();
    const stt = Boolean(recognitionConstructor());
    const capabilities: MioVoiceProviderStatus['capabilities'] = [];
    if (tts) capabilities.push('TTS', 'INTERRUPT');
    if (stt) capabilities.push('STT', 'INTERRUPT');
    return {
      id: this.id,
      kind: this.kind,
      available: tts || stt,
      capabilities,
      reason: tts || stt ? undefined : 'Browser speech APIs are unavailable on this device.',
    };
  }

  async speak(request: MioSpeechRequest): Promise<void> {
    if (request.signal?.aborted) throw new DOMException('Voice request aborted.', 'AbortError');
    const started = mioVoice.speak(request.text, request.locale);
    if (!started) throw new Error('Device speech synthesis is unavailable.');
    if (!request.signal) return;
    const stop = () => mioVoice.stop();
    request.signal.addEventListener('abort', stop, { once: true });
  }

  stopSpeaking(): void {
    mioVoice.stop();
  }

  async startListening(
    request: MioTranscriptionRequest,
    onResult: (result: MioTranscriptionResult) => void,
  ): Promise<void> {
    const Recognition = recognitionConstructor();
    if (!Recognition) throw new Error('Device speech recognition is unavailable.');
    await this.stopListening();
    if (request.signal?.aborted) throw new DOMException('Recognition request aborted.', 'AbortError');

    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = request.locale;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      if (this.recognition !== recognition) return;
      const result = event.results?.[event.resultIndex ?? 0];
      const text = result?.[0]?.transcript?.trim?.() ?? '';
      if (!text) return;
      onResult({ text, locale: request.locale, final: Boolean(result.isFinal) });
    };
    const clear = () => {
      if (this.recognition === recognition) this.recognition = null;
      this.abortCleanup?.();
      this.abortCleanup = null;
    };
    recognition.onerror = clear;
    recognition.onend = clear;

    if (request.signal) {
      const abort = () => recognition.abort?.();
      request.signal.addEventListener('abort', abort, { once: true });
      this.abortCleanup = () => request.signal?.removeEventListener('abort', abort);
    }
    recognition.start();
  }

  async stopListening(): Promise<void> {
    const recognition = this.recognition;
    this.recognition = null;
    this.abortCleanup?.();
    this.abortCleanup = null;
    recognition?.stop();
  }
}

export const deviceVoiceProvider = new DeviceVoiceProvider();
