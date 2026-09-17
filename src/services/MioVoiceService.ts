export type MioVoiceProfile = {
  id: string;
  locale: string;
  rate: number;
  pitch: number;
  volume: number;
  preferredVoiceHints: string[];
};

export type MioVoiceState = 'IDLE' | 'SPEAKING';
export type MioVoiceListener = (state: MioVoiceState) => void;

/**
 * Mio V2 voice identity.
 * External recordings are character references only: never clone,
 * reproduce, or biometric-match the reference speaker.
 */
export const MIO_V2_VOICE: MioVoiceProfile = {
  id: 'mio-v2-warm-deep',
  locale: 'id-ID',
  rate: 0.94,
  pitch: 0.82,
  volume: 1,
  preferredVoiceHints: ['id-ID', 'Indonesian', 'Bahasa Indonesia'],
};

function chooseVoice(voices: SpeechSynthesisVoice[], profile: MioVoiceProfile) {
  const locale = profile.locale.toLowerCase();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === locale) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('id')) ??
    voices.find((voice) =>
      profile.preferredVoiceHints.some((hint) =>
        `${voice.name} ${voice.lang}`.toLowerCase().includes(hint.toLowerCase()),
      ),
    ) ??
    null
  );
}

export class MioVoiceService {
  private profile: MioVoiceProfile;
  private runtimeInstalled = false;
  private nativeSpeak: ((utterance: SpeechSynthesisUtterance) => void) | null = null;
  private state: MioVoiceState = 'IDLE';
  private listeners = new Set<MioVoiceListener>();

  constructor(profile: MioVoiceProfile = MIO_V2_VOICE) {
    this.profile = profile;
  }

  isAvailable() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  getState() { return this.state; }

  subscribe(listener: MioVoiceListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: MioVoiceState) {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private applyProfile(utterance: SpeechSynthesisUtterance) {
    utterance.lang = this.profile.locale;
    utterance.rate = this.profile.rate;
    utterance.pitch = this.profile.pitch;
    utterance.volume = this.profile.volume;
    const voice = chooseVoice(window.speechSynthesis.getVoices(), this.profile);
    if (voice) utterance.voice = voice;
    return utterance;
  }

  private bindLifecycle(utterance: SpeechSynthesisUtterance) {
    const originalStart = utterance.onstart;
    const originalEnd = utterance.onend;
    const originalError = utterance.onerror;
    utterance.onstart = (event) => { this.setState('SPEAKING'); originalStart?.call(utterance, event); };
    utterance.onend = (event) => { this.setState('IDLE'); originalEnd?.call(utterance, event); };
    utterance.onerror = (event) => { this.setState('IDLE'); originalError?.call(utterance, event); };
    return utterance;
  }

  /**
   * Compatibility layer for legacy speech calls. Existing UI code can keep
   * using speechSynthesis while Mio's profile and lifecycle stay centralized.
   */
  installRuntime() {
    if (!this.isAvailable() || this.runtimeInstalled) return false;
    const synthesis = window.speechSynthesis;
    this.nativeSpeak = synthesis.speak.bind(synthesis);
    const service = this;
    synthesis.speak = function mioV2Speak(utterance: SpeechSynthesisUtterance) {
      service.nativeSpeak?.(service.bindLifecycle(service.applyProfile(utterance)));
    };
    this.runtimeInstalled = true;
    return true;
  }

  stop() {
    if (!this.isAvailable()) return;
    window.speechSynthesis.cancel();
    this.setState('IDLE');
  }

  speak(text: string) {
    if (!text.trim() || !this.isAvailable()) return false;
    this.stop();
    const utterance = this.bindLifecycle(this.applyProfile(new SpeechSynthesisUtterance(text.trim())));
    if (this.nativeSpeak) this.nativeSpeak(utterance);
    else window.speechSynthesis.speak(utterance);
    return true;
  }

  test() {
    return this.speak('Test, ini Mio V2, salam kenal.');
  }
}

export const mioVoice = new MioVoiceService();

export function installMioVoiceRuntime() {
  return mioVoice.installRuntime();
}