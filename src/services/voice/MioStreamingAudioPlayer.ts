import type { MioSynthesisChunk } from './MioSynthesisProvider';

export interface MioAudioPlaybackTelemetry {
  bufferedBytes: number;
  firstChunkLatencyMs: number | null;
  playbackStartLatencyMs: number | null;
}

/** Browser playback boundary for encoded synthesis chunks with deterministic cancellation. */
export class MioStreamingAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private objectUrls = new Set<string>();
  private generation = 0;
  private lastTelemetry: MioAudioPlaybackTelemetry = { bufferedBytes: 0, firstChunkLatencyMs: null, playbackStartLatencyMs: null };

  getLastTelemetry(): MioAudioPlaybackTelemetry { return { ...this.lastTelemetry }; }

  async play(chunks: AsyncIterable<MioSynthesisChunk>, signal?: AbortSignal): Promise<void> {
    const generation = ++this.generation;
    const startedAt = performance.now();
    const parts: BlobPart[] = [];
    let format = 'audio/mpeg';
    let bufferedBytes = 0;
    let firstChunkLatencyMs: number | null = null;

    for await (const chunk of chunks) {
      if (signal?.aborted || generation !== this.generation) throw new DOMException('Playback aborted.', 'AbortError');
      if (chunk.data.byteLength) {
        if (firstChunkLatencyMs === null) firstChunkLatencyMs = performance.now() - startedAt;
        bufferedBytes += chunk.data.byteLength;
        parts.push(chunk.data.slice().buffer);
      }
      format = chunk.format;
      if (chunk.final) break;
    }
    if (parts.length === 0 || signal?.aborted || generation !== this.generation) return;

    const url = URL.createObjectURL(new Blob(parts, { type: format }));
    this.objectUrls.add(url);
    const audio = new Audio(url);
    this.activeAudio = audio;
    let abort: (() => void) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          callback();
        };
        abort = () => {
          audio.pause();
          finish(() => reject(new DOMException('Playback aborted.', 'AbortError')));
        };
        signal?.addEventListener('abort', abort, { once: true });
        audio.onended = () => finish(resolve);
        audio.onerror = () => finish(() => reject(new Error('Mio synthesis audio playback failed.')));
        const playbackStartedAt = performance.now();
        void audio.play().then(() => {
          this.lastTelemetry = {
            bufferedBytes,
            firstChunkLatencyMs,
            playbackStartLatencyMs: playbackStartedAt - startedAt,
          };
        }).catch(error => finish(() => reject(error)));
      });
    } finally {
      if (abort) signal?.removeEventListener('abort', abort);
      audio.onended = null;
      audio.onerror = null;
      if (this.activeAudio === audio) this.activeAudio = null;
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }
  }

  stop(): void {
    this.generation += 1;
    this.activeAudio?.pause();
    this.activeAudio = null;
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}

export const mioStreamingAudioPlayer = new MioStreamingAudioPlayer();
