import type { MioProductionSynthesisRequest, MioSynthesisChunk, MioSynthesisProvider, MioSynthesisProviderStatus } from './MioSynthesisProvider';

export interface MioHttpSynthesisProviderOptions {
  endpoint?: string;
  providerId?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Browser-safe adapter to Mio's own synthesis gateway. No upstream TTS secret
 * is accepted here: provider credentials belong exclusively on the server.
 */
export class HttpSynthesisProvider implements MioSynthesisProvider {
  readonly id: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private activeController: AbortController | null = null;

  constructor(options: MioHttpSynthesisProviderOptions = {}) {
    this.id = options.providerId ?? 'mio-http-synthesis';
    this.endpoint = options.endpoint ?? '/api/voice/synthesize';
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async status(): Promise<MioSynthesisProviderStatus> {
    try {
      const response = await this.fetchImpl(this.endpoint, { method: 'HEAD', cache: 'no-store' });
      return { id: this.id, available: response.ok, streaming: true, reason: response.ok ? undefined : `Gateway returned ${response.status}.` };
    } catch (error) {
      return { id: this.id, available: false, streaming: true, reason: error instanceof Error ? error.message : 'Synthesis gateway unavailable.' };
    }
  }

  async *synthesize(request: MioProductionSynthesisRequest): AsyncIterable<MioSynthesisChunk> {
    await this.stop();
    const controller = new AbortController();
    this.activeController = controller;
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/mpeg, audio/wav, audio/ogg' },
        body: JSON.stringify({ text: request.text, locale: request.locale, profile: request.profile }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Mio synthesis gateway failed with ${response.status}.`);
      if (!response.body) throw new Error('Mio synthesis gateway returned no audio stream.');
      const format = this.resolveFormat(response.headers.get('content-type'));
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) yield { data: value, format, final: false };
      }
      yield { data: new Uint8Array(), format, final: true };
    } finally {
      request.signal?.removeEventListener('abort', abort);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  async stop(): Promise<void> {
    this.activeController?.abort();
    this.activeController = null;
  }

  private resolveFormat(contentType: string | null): MioSynthesisChunk['format'] {
    if (contentType?.includes('wav')) return 'audio/wav';
    if (contentType?.includes('ogg')) return 'audio/ogg';
    if (contentType?.includes('pcm')) return 'audio/pcm';
    return 'audio/mpeg';
  }
}

export const httpSynthesisProvider = new HttpSynthesisProvider();
