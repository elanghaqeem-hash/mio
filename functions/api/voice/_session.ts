export interface MioVoiceSession {
  id: string;
  subject: string;
  expiresAt?: number;
}

export interface MioVoiceSessionEnv {
  MIO_VOICE_REQUIRE_SESSION?: string;
}

/**
 * Deployment-neutral session boundary for Voice V4.3.
 *
 * A trusted auth layer (Cloudflare Access, Worker middleware, or the future Mio
 * account service) may inject identity headers after authentication. The voice
 * endpoint consumes that verified identity but never accepts a browser-provided
 * subject as proof of authentication by itself.
 */
export function resolveMioVoiceSession(request: Request): MioVoiceSession | null {
  const subject = request.headers.get('cf-access-authenticated-user-email')?.trim()
    || request.headers.get('x-mio-authenticated-subject')?.trim();
  if (!subject) return null;

  const sessionId = request.headers.get('x-mio-session-id')?.trim()
    || request.headers.get('cf-ray')?.trim()
    || 'edge-session';

  return {
    id: sessionId.slice(0, 160),
    subject: subject.slice(0, 320),
  };
}

export function voiceSessionRequired(env: MioVoiceSessionEnv): boolean {
  return env.MIO_VOICE_REQUIRE_SESSION?.trim().toLowerCase() === 'true';
}
