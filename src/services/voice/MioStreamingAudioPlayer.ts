import type { MioSynthesisChunk } from './MioSynthesisProvider';

export type MioPlaybackMode = 'media-source' | 'blob-fallback';

export interface MioAudioPlaybackTelemetry {
  bufferedBytes: number;
  firstChunkLatencyMs: number | null;
  firstAudibleLatencyMs: number | null;
  playbackStartLatencyMs: number | null;
  playbackMode: MioPlaybackMode;
  appendCount: number;
  rebufferCount: number;
  prebufferBytes: number;
}

const initialTelemetry = (): MioAudioPlaybackTelemetry => ({
  bufferedBytes: 0,
  firstChunkLatencyMs: null,
  firstAudibleLatencyMs: null,
  playbackStartLatencyMs: null,
  playbackMode: 'blob-fallback',
  appendCount: 0,
  rebufferCount: 0,
  prebufferBytes: 0,
});

/**
 * Low-latency browser playback boundary.
 * Uses MediaSource only when the runtime explicitly supports the encoded stream,
 * and preserves the deterministic Blob path for Safari/iOS and other runtimes.
 */
export class MioStreamingAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private objectUrls = new Set<string>();
  private generation = 0;
  private lastTelemetry = initialTelemetry();

  getLastTelemetry(): MioAudioPlaybackTelemetry { return { ...this.lastTelemetry }; }

  async play(chunks: AsyncIterable<MioSynthesisChunk>, signal?: AbortSignal): Promise<void> {
    const generation = ++this.generation;
    const iterator = chunks[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done || signal?.aborted || generation !== this.generation) return;

    const startedAt = performance.now();
    const firstChunkLatencyMs = 0;
    const mime = first.value.format;
    if (this.canUseMediaSource(mime)) {
      try {
        await this.playMediaSource(first.value, iterator, generation, startedAt, firstChunkLatencyMs, signal);
        return;
      } catch (error) {
        if (signal?.aborted || generation !== this.generation || (error instanceof DOMException && error.name === 'AbortError')) throw error;
        // Capability checks can still fail at runtime. Fall back without losing the first chunk.
      }
    }
    await this.playBlob(first.value, iterator, generation, startedAt, firstChunkLatencyMs, signal);
  }

  private canUseMediaSource(format: string): boolean {
    return typeof MediaSource !== 'undefined'
      && typeof MediaSource.isTypeSupported === 'function'
      && MediaSource.isTypeSupported(format);
  }

  private async playMediaSource(
    first: MioSynthesisChunk,
    iterator: AsyncIterator<MioSynthesisChunk>,
    generation: number,
    startedAt: number,
    firstChunkLatencyMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const mediaSource = new MediaSource();
    const url = URL.createObjectURL(mediaSource);
    this.objectUrls.add(url);
    const audio = new Audio(url);
    this.activeAudio = audio;
    let bytes = 0;
    let appendCount = 0;
    let rebufferCount = 0;
    let prebufferBytes = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        mediaSource.addEventListener('sourceopen', () => resolve(), { once: true });
        mediaSource.addEventListener('sourceclose', () => reject(new Error('Mio MediaSource closed before playback.')), { once: true });
        audio.onerror = () => reject(new Error('Mio MediaSource playback failed.'));
      });
      if (signal?.aborted || generation !== this.generation) throw new DOMException('Playback aborted.', 'AbortError');
      const sourceBuffer = mediaSource.addSourceBuffer(first.format);
      const append = (data: Uint8Array) => new Promise<void>((resolve, reject) => {
        const done = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('Mio audio buffer append failed.')); };
        const cleanup = () => {
          sourceBuffer.removeEventListener('updateend', done);
          sourceBuffer.removeEventListener('error', failed);
        };
        sourceBuffer.addEventListener('updateend', done, { once: true });
        sourceBuffer.addEventListener('error', failed, { once: true });
        sourceBuffer.appendBuffer(data.slice().buffer);
      });

      await append(first.data);
      bytes += first.data.byteLength;
      appendCount += 1;
      prebufferBytes = bytes;
      const playbackStartedAt = performance.now();
      await audio.play();
      this.lastTelemetry = {
        bufferedBytes: bytes,
        firstChunkLatencyMs,
        firstAudibleLatencyMs: performance.now() - startedAt,
        playbackStartLatencyMs: playbackStartedAt - startedAt,
        playbackMode: 'media-source',
        appendCount,
        rebufferCount,
        prebufferBytes,
      };

      let current = first;
      while (!current.final) {
        if (signal?.aborted || generation !== this.generation) throw new DOMException('Playback aborted.', 'AbortError');
        const next = await iterator.next();
        if (next.done) break;
        current = next.value;
        if (current.data.byteLength) {
          await append(current.data);
          bytes += current.data.byteLength;
          appendCount += 1;
          const wasWaiting = audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
          if (wasWaiting && !audio.paused && !audio.ended) rebufferCount += 1;
          this.lastTelemetry = { ...this.lastTelemetry, bufferedBytes: bytes, appendCount, rebufferCount };
        }
      }
      if (mediaSource.readyState === 'open' && !sourceBuffer.updating) mediaSource.endOfStream();
      await this.waitForEnd(audio, generation, signal);
    } finally {
      audio.onerror = null;
      if (this.activeAudio === audio) this.activeAudio = null;
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }
  }

  private async playBlob(
    first: MioSynthesisChunk,
    iterator: AsyncIterator<MioSynthesisChunk>,
    generation: number,
    startedAt: number,
    firstChunkLatencyMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const parts: BlobPart[] = [];
    let format = first.format;
    let bytes = 0;
    let appendCount = 0;
    let current = first;
    while (true) {
      if (signal?.aborted || generation !== this.generation) throw new DOMException('Playback aborted.', 'AbortError');
      if (current.data.byteLength) {
        parts.push(current.data.slice().buffer);
        bytes += current.data.byteLength;
        appendCount += 1;
      }
      format = current.format;
      if (current.final) break;
      const next = await iterator.next();
      if (next.done) break;
      current = next.value;
    }
    if (!parts.length) return;

    const url = URL.createObjectURL(new Blob(parts, { type: format }));
    this.objectUrls.add(url);
    const audio = new Audio(url);
    this.activeAudio = audio;
    try {
      const playbackStartedAt = performance.now();
      await audio.play();
      this.lastTelemetry = {
        bufferedBytes: bytes,
        firstChunkLatencyMs,
        firstAudibleLatencyMs: performance.now() - startedAt,
        playbackStartLatencyMs: playbackStartedAt - startedAt,
        playbackMode: 'blob-fallback',
        appendCount,
        rebufferCount: 0,
        prebufferBytes: bytes,
      };
      await this.waitForEnd(audio, generation, signal);
    } finally {
      if (this.activeAudio === audio) this.activeAudio = null;
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }
  }

  private waitForEnd(audio: HTMLAudioElement, generation: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        audio.onended = null;
        audio.onerror = null;
        callback();
      };
      const abort = () => {
        audio.pause();
        finish(() => reject(new DOMException('Playback aborted.', 'AbortError')));
      };
      signal?.addEventListener('abort', abort, { once: true });
      audio.onended = () => finish(resolve);
      audio.onerror = () => finish(() => reject(new Error('Mio synthesis audio playback failed.')));
      if (signal?.aborted || generation !== this.generation) abort();
    });
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
