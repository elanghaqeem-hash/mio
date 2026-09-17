import type { MioLocale } from './MioVoiceProvider';
import type { MioSynthesisProfile } from './MioSynthesisProfile';

export type MioSynthesisAudioFormat = 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/pcm';

export interface MioSynthesisChunk {
  data: Uint8Array;
  format: MioSynthesisAudioFormat;
  sampleRate?: number;
  final: boolean;
}

export interface MioProductionSynthesisRequest {
  text: string;
  locale: MioLocale;
  profile: MioSynthesisProfile;
  signal?: AbortSignal;
}

export interface MioSynthesisProviderStatus {
  id: string;
  available: boolean;
  streaming: boolean;
  locales?: MioLocale[];
  reason?: string;
}

/**
 * Boundary for a licensed production TTS engine.
 *
 * Implementations must use a voice the project is licensed or otherwise
 * authorized to synthesize. Reference recordings from third-party performers
 * are never accepted as enrollment, cloning, speaker embedding, or imitation
 * inputs through this contract.
 */
export interface MioSynthesisProvider {
  readonly id: string;
  status(): MioSynthesisProviderStatus | Promise<MioSynthesisProviderStatus>;
  synthesize(request: MioProductionSynthesisRequest): AsyncIterable<MioSynthesisChunk>;
  stop(): void | Promise<void>;
}
