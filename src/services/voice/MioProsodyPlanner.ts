import type { MioLocale } from './MioVoiceProvider';
import type { MioSynthesisEmotion, MioSynthesisProfile } from './MioSynthesisProfile';
import { MIO_V4_SYNTHESIS_PROFILE } from './MioSynthesisProfile';

export interface MioProsodyPlan {
  locale: MioLocale;
  emotion: MioSynthesisEmotion;
  profile: MioSynthesisProfile;
}

/** Lightweight deterministic planner. It never rewrites semantic content. */
export class MioProsodyPlanner {
  plan(text: string, locale: MioLocale): MioProsodyPlan {
    const normalized = text.trim();
    const question = /[?？]\s*$/.test(normalized);
    const excited = /[!！]\s*$/.test(normalized);
    const technical = /\b(API|SDK|HTTP|HTTPS|JSON|TypeScript|JavaScript|SQL|GitHub|Cloudflare|AI|TTS|STT)\b/i.test(normalized);

    let emotion: MioSynthesisEmotion = 'warm';
    if (technical) emotion = 'focused';
    else if (question) emotion = 'gentle';
    else if (excited) emotion = 'confident';

    const profile: MioSynthesisProfile = {
      ...MIO_V4_SYNTHESIS_PROFILE,
      locale,
      emotion,
      speakingRate: technical ? 0.95 : MIO_V4_SYNTHESIS_PROFILE.speakingRate,
      expressiveness: technical ? 0.5 : question ? 0.58 : MIO_V4_SYNTHESIS_PROFILE.expressiveness,
      pauseScale: technical ? 1.1 : MIO_V4_SYNTHESIS_PROFILE.pauseScale,
    };
    return { locale, emotion, profile };
  }
}

export const mioProsodyPlanner = new MioProsodyPlanner();
