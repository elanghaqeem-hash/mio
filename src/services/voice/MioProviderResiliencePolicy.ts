export const MIO_VOICE_RETRYABLE_PROVIDER_STATUS = new Set([408, 429, 500, 502, 503, 504]);
export const MIO_VOICE_MAX_PROVIDER_ATTEMPTS = 2;
export function shouldRetryMioVoiceProvider(status:number, attempt:number):boolean {
 return attempt < MIO_VOICE_MAX_PROVIDER_ATTEMPTS && MIO_VOICE_RETRYABLE_PROVIDER_STATUS.has(status);
}
