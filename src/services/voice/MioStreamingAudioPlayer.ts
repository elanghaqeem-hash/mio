import type { MioSynthesisChunk } from './MioSynthesisProvider';

/** Browser playback boundary for encoded synthesis chunks with deterministic cancellation. */
export class MioStreamingAudioPlayer {
  private activeAudio: HTMLAudioElement | null = null;
  private objectUrls = new Set<string>();
  private generation = 0;

  async play(chunks: AsyncIterable<MioSynthesisChunk>, signal?: AbortSignal): Promise<void> {
    const generation = ++this.generation;
    const parts: BlobPart[] = [];
    let format = 'audio/mpeg';
    for await (const chunk of chunks) {
      if (signal?.aborted || generation !== this.generation) throw new DOMException('Playback aborted.', 'AbortError');
      parts.push(chunk.data.slice().buffer);
      format = chunk.format;
      if (chunk.final) break;
    }
    if (parts.length === 0 || signal?.aborted || generation !== this.generation) return;

    const url = URL.createObjectURL(new Blob(parts, { type: format }));
    this.objectUrls.add(url);
    const audio = new Audio(url);
    this.activeAudio = audio;
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { audio.pause(); reject(new DOMException('Playback aborted.', 'AbortError')); };
        signal?.addEventListener('abort', abort, { once: true });
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Mio synthesis audio playback failed.'));
        void audio.play().catch(reject);
      });
    } finally {
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
