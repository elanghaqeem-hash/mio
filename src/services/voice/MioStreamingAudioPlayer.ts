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
  maxObservedBufferAheadMs: number;
  prebufferTargetChunks: number;
}

const initialTelemetry = (): MioAudioPlaybackTelemetry => ({
  bufferedBytes: 0,
  firstChunkLatencyMs: null,
  firstAudibleLatencyMs: null,
  playbackStartLatencyMs: null,
  playbackMode: 'blob-fallback',
  appendCount: 0,
  rebufferCount: 0,
  maxObservedBufferAheadMs: 0,
  prebufferTargetChunks: 1,
});

/**
 * Low-latency browser playback boundary.
 * Uses MediaSource only when the runtime explicitly supports the encoded stream,
 * and preserves the deterministic Blob path for Safari/iOS and other runtimes.
 */
class MioMediaSourceCommittedError extends Error {
  constructor(readonly cause: unknown) {
    super('Mio MediaSource failed after incremental playback committed.');
    this.name = 'MioMediaSourceCommittedError';
  }
}

export class MioStreamingAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private objectUrls = new Set<string>();
  private generation = 0;
  private lastTelemetry = initialTelemetry();

  getLastTelemetry(): MioAudioPlaybackTelemetry { return { ...this.lastTelemetry }; }

  async play(chunks: AsyncIterable<MioSynthesisChunk>, signal?: AbortSignal): Promise<void> {
    const generation = ++this.generation;
    const startedAt = performance.now();
    const iterator = chunks[Symbol.asyncIterator]();
    let first = await iterator.next();
    while (!first.done && !first.value.data.byteLength) {
      if (signal?.aborted || generation !== this.generation) return;
      first = await iterator.next();
    }
    if (first.done || signal?.aborted || generation !== this.generation) return;

    const firstChunkLatencyMs = performance.now() - startedAt;
    const mime = first.value.format;
    if (this.canUseMediaSource(mime)) {
      try {
        await this.playMediaSource(first.value, iterator, generation, startedAt, firstChunkLatencyMs, signal);
        return;
      } catch (error) {
        if (signal?.aborted || generation !== this.generation || (error instanceof DOMException && error.name === 'AbortError')) throw error;
        if (error instanceof MioMediaSourceCommittedError) throw error.cause ?? error;
        // Only setup failures before the first encoded chunk is committed may
        // reuse the untouched iterator in the deterministic Blob fallback.
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
    let maxObservedBufferAheadMs = 0;
    let hasStarted = false;
    // Start conservatively with two encoded chunks when available. This bounded
    // prebuffer trades a small amount of latency for fewer immediate underruns.
    const prebufferTargetChunks = 2;
    const updateBufferTelemetry = () => {
      if (!audio.buffered.length) return;
      const end = audio.buffered.end(audio.buffered.length - 1);
      const aheadMs = Math.max(0, (end - audio.currentTime) * 1000);
      maxObservedBufferAheadMs = Math.max(maxObservedBufferAheadMs, aheadMs);
      this.lastTelemetry = { ...this.lastTelemetry, bufferedBytes: bytes, appendCount, rebufferCount, maxObservedBufferAheadMs };
    };
    const onWaiting = () => { if (hasStarted) { rebufferCount += 1; updateBufferTelemetry(); } };
    audio.addEventListener('waiting', onWaiting);

    let committed = false;
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

      let current = first;
      await append(current.data);
      committed = true;
      bytes += current.data.byteLength;
      appendCount += 1;
      while (!current.final && appendCount < prebufferTargetChunks) {
        const next = await iterator.next();
        if (next.done) break;
        current = next.value;
        if (current.data.byteLength) {
          await append(current.data);
          bytes += current.data.byteLength;
          appendCount += 1;
        }
      }
      const playbackStartedAt = performance.now();
      const playing = this.waitForPlaying(audio, generation, signal);
      await audio.play();
      const firstAudibleLatencyMs = await playing;
      this.lastTelemetry = {
        bufferedBytes: bytes,
        firstChunkLatencyMs,
        firstAudibleLatencyMs,
        playbackStartLatencyMs: playbackStartedAt - startedAt,
        playbackMode: 'media-source',
        appendCount,
        rebufferCount,
        maxObservedBufferAheadMs,
        prebufferTargetChunks,
      };
      hasStarted = true;
      updateBufferTelemetry();

      while (!current.final) {
        if (signal?.aborted || generation !== this.generation) throw new DOMException('Playback aborted.', 'AbortError');
        const next = await iterator.next();
        if (next.done) break;
        current = next.value;
        if (current.data.byteLength) {
          await append(current.data);
          bytes += current.data.byteLength;
          appendCount += 1;
          updateBufferTelemetry();
        }
      }
      if (mediaSource.readyState === 'open' && !sourceBuffer.updating) mediaSource.endOfStream();
      await this.waitForEnd(audio, generation, signal);
    } catch (error) {
      if (committed && !(error instanceof DOMException && error.name === 'AbortError')) {
        throw new MioMediaSourceCommittedError(error);
      }
      throw error;
    } finally {
      audio.removeEventListener('waiting', onWaiting);
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
      const playing = this.waitForPlaying(audio, generation, signal);
      await audio.play();
      const firstAudibleLatencyMs = await playing;
      this.lastTelemetry = {
        bufferedBytes: bytes,
        firstChunkLatencyMs,
        firstAudibleLatencyMs:
        playbackStartLatencyMs: playbackStartedAt - startedAt,
        playbackMode: 'blob-fallback',
        appendCount,
        rebufferCount: 0,
        maxObservedBufferAheadMs: 0,
        prebufferTargetChunks: 0,
      };
      await this.waitForEnd(audio, generation, signal);
    } finally {
      if (this.activeAudio === audio) this.activeAudio = null;
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }
  }

  private waitForPlaying(audio: HTMLAudioElement, generation: number, signal?: AbortSignal): Promise<number> {
    const startedAt = performance.now();
    return new Promise<number>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('playing', onPlaying);
        signal?.removeEventListener('abort', onAbort);
      };
      const onPlaying = () => { cleanup(); resolve(performance.now() - startedAt); };
      const onAbort = () => { cleanup(); reject(new DOMException('Playback aborted.', 'AbortError')); };
      audio.addEventListener('playing', onPlaying, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted || generation !== this.generation) onAbort();
    }).then(latency => (performance.now() - startedAt - latency) + latency);
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
