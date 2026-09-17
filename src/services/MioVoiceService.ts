export type MioVoiceProfile = {
  id: string;
  locale: string;
  rate: number;
  pitch: number;
  volume: number;
  preferredVoiceHints: string[];
};

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

  constructor(profile: MioVoiceProfile = MIO_V2_VOICE) {
    this.profile = profile;
  }

  isAvailable() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
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

  /**
   * Installs a compatibility layer so legacy Mio speech calls also receive
   * the V2 identity. This lets existing UI code keep using speechSynthesis
   * while voice output is governed centrally here.
   */
  installRuntime() {
    if (!this.isAvailable() || this.runtimeInstalled) return false;
    const synthesis = window.speechSynthesis;
    this.nativeSpeak = synthesis.speak.bind(synthesis);
    const service = this;
    synthesis.speak = function mioV2Speak(utterance: SpeechSynthesisUtterance) {
      service.nativeSpeak?.(service.applyProfile(utterance));
    };
    this.runtimeInstalled = true;

    // Browser voice lists can arrive asynchronously. The profile is applied
    // again at speak-time, so newly available Indonesian voices are picked up.
    return true;
  }

  stop() {
    if (this.isAvailable()) window.speechSynthesis.cancel();
  }

  speak(text: string) {
    if (!text.trim() || !this.isAvailable()) return false;
    this.stop();
    const utterance = this.applyProfile(new SpeechSynthesisUtterance(text.trim()));
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
