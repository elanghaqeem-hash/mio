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
 *
 * IMPORTANT: Any external voice sample is a character reference only.
 * Do not clone, reproduce, or biometric-match the reference speaker.
 * Mio must use an independently provided/licensed synthesis voice.
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

  constructor(profile: MioVoiceProfile = MIO_V2_VOICE) {
    this.profile = profile;
  }

  isAvailable() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  stop() {
    if (this.isAvailable()) window.speechSynthesis.cancel();
  }

  speak(text: string) {
    if (!text.trim() || !this.isAvailable()) return false;

    this.stop();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = this.profile.locale;
    utterance.rate = this.profile.rate;
    utterance.pitch = this.profile.pitch;
    utterance.volume = this.profile.volume;

    const voice = chooseVoice(window.speechSynthesis.getVoices(), this.profile);
    if (voice) utterance.voice = voice;

    window.speechSynthesis.speak(utterance);
    return true;
  }

  test() {
    return this.speak('Test, ini Mio V2, salam kenal.');
  }
}

export const mioVoice = new MioVoiceService();
