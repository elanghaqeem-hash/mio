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
export type MioLanguage = { locale: string; label: string; shortLabel: string };

export const MIO_LANGUAGES: MioLanguage[] = [
  { locale: 'auto', label: 'Auto detect', shortLabel: 'AUTO' },
  { locale: 'id-ID', label: 'Bahasa Indonesia', shortLabel: 'ID' },
  { locale: 'en-US', label: 'English', shortLabel: 'EN' },
  { locale: 'ms-MY', label: 'Bahasa Melayu', shortLabel: 'MS' },
  { locale: 'ja-JP', label: '日本語', shortLabel: 'JA' },
  { locale: 'ko-KR', label: '한국어', shortLabel: 'KO' },
  { locale: 'zh-CN', label: '中文', shortLabel: 'ZH' },
  { locale: 'th-TH', label: 'ไทย', shortLabel: 'TH' },
  { locale: 'vi-VN', label: 'Tiếng Việt', shortLabel: 'VI' },
  { locale: 'es-ES', label: 'Español', shortLabel: 'ES' },
  { locale: 'fr-FR', label: 'Français', shortLabel: 'FR' },
  { locale: 'de-DE', label: 'Deutsch', shortLabel: 'DE' },
  { locale: 'it-IT', label: 'Italiano', shortLabel: 'IT' },
  { locale: 'pt-BR', label: 'Português', shortLabel: 'PT' },
  { locale: 'nl-NL', label: 'Nederlands', shortLabel: 'NL' },
  { locale: 'tr-TR', label: 'Türkçe', shortLabel: 'TR' },
  { locale: 'ru-RU', label: 'Русский', shortLabel: 'RU' },
  { locale: 'ar-SA', label: 'العربية', shortLabel: 'AR' },
  { locale: 'hi-IN', label: 'हिन्दी', shortLabel: 'HI' },
];

/** Mio V2 uses an original identity. External recordings are character references only. */
export const MIO_V2_VOICE: MioVoiceProfile = {
  id: 'mio-v2-warm-deep', locale: 'id-ID', rate: 0.94, pitch: 0.82, volume: 1,
  preferredVoiceHints: ['Indonesian', 'Bahasa Indonesia'],
};

const LATIN_HINTS: Array<[string, RegExp]> = [
  ['id-ID', /\b(yang|dan|dengan|untuk|saya|kamu|anda|ini|itu|tidak|bisa|tolong|bagaimana|terima kasih)\b/i],
  ['ms-MY', /\b(saya|awak|anda|boleh|tidak|terima kasih|bagaimana|dengan|untuk|daripada)\b/i],
  ['es-ES', /\b(el|la|los|las|que|para|gracias|hola|cómo|por favor|usted)\b/i],
  ['fr-FR', /\b(le|la|les|des|pour|merci|bonjour|comment|vous|avec)\b/i],
  ['de-DE', /\b(der|die|das|und|für|danke|hallo|wie|bitte|nicht)\b/i],
  ['it-IT', /\b(il|lo|la|gli|per|grazie|ciao|come|voi|non)\b/i],
  ['pt-BR', /\b(o|a|os|as|para|obrigad[oa]|olá|como|você|não)\b/i],
  ['nl-NL', /\b(de|het|een|voor|dank|hallo|hoe|jij|niet|met)\b/i],
  ['tr-TR', /\b(ve|bir|için|teşekkür|merhaba|nasıl|siz|değil|ile)\b/i],
  ['vi-VN', /\b(và|của|cho|cảm ơn|xin chào|không|bạn|tôi|với)\b/i],
];

export function detectMioLocale(text: string, fallback = 'id-ID'): string {
  const value = text.trim();
  if (!value) return fallback;
  if (/\p{Script=Arabic}/u.test(value)) return 'ar-SA';
  if (/\p{Script=Devanagari}/u.test(value)) return 'hi-IN';
  if (/\p{Script=Hangul}/u.test(value)) return 'ko-KR';
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(value)) return 'ja-JP';
  if (/\p{Script=Thai}/u.test(value)) return 'th-TH';
  if (/\p{Script=Cyrillic}/u.test(value)) return 'ru-RU';
  if (/\p{Script=Han}/u.test(value)) return 'zh-CN';
  for (const [locale, pattern] of LATIN_HINTS) if (pattern.test(value)) return locale;
  return /[A-Za-z]/.test(value) ? 'en-US' : fallback;
}

function chooseVoice(voices: SpeechSynthesisVoice[], locale: string, profile: MioVoiceProfile) {
  const normalized = locale.toLowerCase();
  const language = normalized.split('-')[0];
  return voices.find((voice) => voice.lang.toLowerCase() === normalized)
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`))
    ?? (language === 'id' ? voices.find((voice) => profile.preferredVoiceHints.some((hint) => `${voice.name} ${voice.lang}`.toLowerCase().includes(hint.toLowerCase()))) : undefined)
    ?? null;
}

export class MioVoiceService {
  private profile: MioVoiceProfile;
  private runtimeInstalled = false;
  private nativeSpeak: ((utterance: SpeechSynthesisUtterance) => void) | null = null;
  private state: MioVoiceState = 'IDLE';
  private listeners = new Set<MioVoiceListener>();
  private preferredLocale = 'auto';
  private lastDetectedLocale = 'id-ID';

  constructor(profile: MioVoiceProfile = MIO_V2_VOICE) { this.profile = profile; }
  isAvailable() { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }
  getState() { return this.state; }
  getPreferredLocale() { return this.preferredLocale; }
  getLastDetectedLocale() { return this.lastDetectedLocale; }

  setPreferredLocale(locale: string) {
    this.preferredLocale = MIO_LANGUAGES.some((language) => language.locale === locale) ? locale : 'auto';
  }

  resolveLocale(text = '') {
    const fallback = this.lastDetectedLocale || this.profile.locale;
    const locale = this.preferredLocale === 'auto' ? detectMioLocale(text, fallback) : this.preferredLocale;
    this.lastDetectedLocale = locale;
    return locale;
  }

  getRecognitionLocale() {
    if (this.preferredLocale !== 'auto') return this.preferredLocale;
    if (this.lastDetectedLocale) return this.lastDetectedLocale;
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    return this.profile.locale;
  }

  subscribe(listener: MioVoiceListener): () => void {
    this.listeners.add(listener); listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private setState(state: MioVoiceState) {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private applyProfile(utterance: SpeechSynthesisUtterance, text = utterance.text) {
    const locale = this.resolveLocale(text);
    utterance.lang = locale; utterance.rate = this.profile.rate; utterance.pitch = this.profile.pitch; utterance.volume = this.profile.volume;
    const voice = chooseVoice(window.speechSynthesis.getVoices(), locale, this.profile);
    if (voice) utterance.voice = voice;
    return utterance;
  }

  private bindLifecycle(utterance: SpeechSynthesisUtterance) {
    const originalStart = utterance.onstart; const originalEnd = utterance.onend; const originalError = utterance.onerror;
    utterance.onstart = (event) => { this.setState('SPEAKING'); originalStart?.call(utterance, event); };
    utterance.onend = (event) => { this.setState('IDLE'); originalEnd?.call(utterance, event); };
    utterance.onerror = (event) => { this.setState('IDLE'); originalError?.call(utterance, event); };
    return utterance;
  }

  installRuntime() {
    if (!this.isAvailable() || this.runtimeInstalled) return false;
    const synthesis = window.speechSynthesis;
    this.nativeSpeak = synthesis.speak.bind(synthesis);
    synthesis.speak = (utterance: SpeechSynthesisUtterance) => { this.nativeSpeak?.(this.bindLifecycle(this.applyProfile(utterance))); };
    this.runtimeInstalled = true;
    return true;
  }

  stop() { if (!this.isAvailable()) return; window.speechSynthesis.cancel(); this.setState('IDLE'); }

  speak(text: string, locale?: string) {
    if (!text.trim() || !this.isAvailable()) return false;
    const previousPreference = this.preferredLocale;
    if (locale) this.setPreferredLocale(locale);
    this.stop();
    const utterance = this.bindLifecycle(this.applyProfile(new SpeechSynthesisUtterance(text.trim()), text));
    if (locale) this.preferredLocale = previousPreference;
    if (this.nativeSpeak) this.nativeSpeak(utterance); else window.speechSynthesis.speak(utterance);
    return true;
  }

  test(locale = this.preferredLocale) {
    const samples: Record<string, string> = {
      'id-ID': 'Test, ini Mio V2, salam kenal.', 'en-US': 'Test, this is Mio V2. Nice to meet you.',
      'ms-MY': 'Ujian, ini Mio V2. Salam kenal.', 'ja-JP': 'テスト、Mio V2です。よろしくお願いします。',
      'ko-KR': '테스트, 미오 V2입니다. 반갑습니다.', 'zh-CN': '测试，这是 Mio V2，很高兴认识你。',
      'th-TH': 'ทดสอบ นี่คือ Mio V2 ยินดีที่ได้รู้จัก', 'vi-VN': 'Thử nghiệm, đây là Mio V2. Rất vui được gặp bạn.',
      'es-ES': 'Prueba, soy Mio V2. Encantada de conocerte.', 'fr-FR': 'Test, je suis Mio V2. Enchantée.',
      'de-DE': 'Test, ich bin Mio V2. Freut mich.', 'it-IT': 'Test, sono Mio V2. Piacere di conoscerti.',
      'pt-BR': 'Teste, eu sou a Mio V2. Prazer em conhecer você.', 'nl-NL': 'Test, ik ben Mio V2. Aangenaam.',
      'tr-TR': 'Test, ben Mio V2. Tanıştığımıza memnun oldum.', 'ru-RU': 'Тест, я Mio V2. Приятно познакомиться.',
      'ar-SA': 'اختبار، أنا ميو V2، سعيدة بلقائك.', 'hi-IN': 'टेस्ट, मैं Mio V2 हूँ। आपसे मिलकर खुशी हुई।',
    };
    const resolved = locale === 'auto' ? this.lastDetectedLocale : locale;
    return this.speak(samples[resolved] ?? samples['id-ID'], resolved);
  }
}

export const mioVoice = new MioVoiceService();
export function installMioVoiceRuntime() { return mioVoice.installRuntime(); }
