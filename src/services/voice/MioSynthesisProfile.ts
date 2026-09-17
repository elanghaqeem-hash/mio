import type { MioLocale } from './MioVoiceProvider';

export type MioSynthesisEmotion = 'neutral' | 'warm' | 'confident' | 'gentle' | 'focused' | 'playful';

export interface MioSynthesisProfile {
  id: string;
  locale: MioLocale;
  speakingRate: number;
  pitchSemitones: number;
  warmth: number;
  expressiveness: number;
  breathiness: number;
  pauseScale: number;
  emotion: MioSynthesisEmotion;
}

/**
 * Provider-neutral target identity for Mio's production synthesis layer.
 * Values describe Mio's own licensed/consented voice direction; they are not
 * biometric measurements and must never be derived from performer recordings.
 */
export const MIO_V4_SYNTHESIS_PROFILE: MioSynthesisProfile = {
  id: 'mio-v4-warm-deep',
  locale: 'id-ID',
  speakingRate: 0.98,
  pitchSemitones: -1.7,
  warmth: 0.68,
  expressiveness: 0.62,
  breathiness: 0.12,
  pauseScale: 1.05,
  emotion: 'warm',
};

export interface MioSynthesisRequest {
  text: string;
  locale: MioLocale;
  profile?: Partial<MioSynthesisProfile>;
}

export function resolveMioSynthesisProfile(request: MioSynthesisRequest): MioSynthesisProfile {
  return {
    ...MIO_V4_SYNTHESIS_PROFILE,
    locale: request.locale || MIO_V4_SYNTHESIS_PROFILE.locale,
    ...request.profile,
  };
}
