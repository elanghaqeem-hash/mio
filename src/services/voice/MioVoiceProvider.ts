export type MioLocale = string;

export type MioVoiceProviderKind = 'DEVICE' | 'STREAMING';
export type MioVoiceProviderCapability = 'TTS' | 'STT' | 'STREAMING_TTS' | 'STREAMING_STT' | 'INTERRUPT' | 'VAD';

export interface MioVoiceProviderStatus {
  id: string;
  kind: MioVoiceProviderKind;
  available: boolean;
  capabilities: MioVoiceProviderCapability[];
  reason?: string;
}

/** Provider-neutral, bounded prosody hints. Providers may ignore unsupported hints. */
export interface MioVoiceProsodyHint {
  rateMultiplier?: number;
  pitchDelta?: number;
  volumeMultiplier?: number;
}

export interface MioSpeechRequest {
  text: string;
  locale: MioLocale;
  signal?: AbortSignal;
  prosody?: MioVoiceProsodyHint;
}

export interface MioTranscriptionRequest {
  locale: MioLocale;
  signal?: AbortSignal;
}

export interface MioTranscriptionResult {
  text: string;
  locale: MioLocale;
  final: boolean;
}

/**
 * Provider-neutral contract for Mio Voice Runtime V3.
 *
 * Implementations may use device/browser speech or an independently licensed
 * streaming STT/TTS service. External performer recordings must never be used
 * as cloning, imitation or biometric enrollment sources.
 */
export interface MioVoiceProvider {
  readonly id: string;
  readonly kind: MioVoiceProviderKind;

  status(): MioVoiceProviderStatus | Promise<MioVoiceProviderStatus>;
  speak(request: MioSpeechRequest): Promise<void>;
  stopSpeaking(): void | Promise<void>;

  startListening?(
    request: MioTranscriptionRequest,
    onResult: (result: MioTranscriptionResult) => void,
  ): Promise<void>;
  stopListening?(): void | Promise<void>;
}

export function supportsVoiceCapability(
  status: MioVoiceProviderStatus,
  capability: MioVoiceProviderCapability,
): boolean {
  return status.available && status.capabilities.includes(capability);
}
