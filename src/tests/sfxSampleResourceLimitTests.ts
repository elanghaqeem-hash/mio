import { MAX_SFX_SAMPLE_BYTES, MAX_SFX_SAMPLE_SECONDS, assertSFXSampleSize, decodeSFXSample } from '../creative/SFXSampleRuntime';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const rejects = async (run: () => Promise<unknown>, pattern: RegExp): Promise<boolean> => {
  try { await run(); return false; } catch (error) { return pattern.test(error instanceof Error ? error.message : String(error)); }
};
// Minimal BaseAudioContext stand-in: decodeAudioData reports the decoded duration only.
const contextDecoding = (duration: number, calls: { decoded: number }) => ({
  decodeAudioData: async () => { calls.decoded++; return { duration, sampleRate: 48000, numberOfChannels: 2, length: Math.round(duration * 48000) }; },
}) as unknown as BaseAudioContext;

// MIO-PRV-00.05: sample import must fail safely instead of exhausting memory.
export async function runSFXSampleResourceLimitTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['size guard accepts in-range files and rejects empty or oversized ones', async () => {
      assertSFXSampleSize(1024);
      let empty = false; try { assertSFXSampleSize(0); } catch { empty = true; }
      let huge = false; try { assertSFXSampleSize(MAX_SFX_SAMPLE_BYTES + 1); } catch { huge = true; }
      assert(empty && huge, 'size guard did not reject');
    }],
    ['oversized data is rejected before decoding', async () => {
      const calls = { decoded: 0 };
      const oversized = { byteLength: MAX_SFX_SAMPLE_BYTES + 1, slice: () => new ArrayBuffer(0) } as unknown as ArrayBuffer;
      assert(await rejects(() => decodeSFXSample(contextDecoding(1, calls), oversized, 'a', 'big.wav'), /MB limit/), 'oversized data accepted');
      assert(calls.decoded === 0, 'oversized data was decoded');
    }],
    ['decoded duration above the limit is rejected', async () => {
      const calls = { decoded: 0 };
      assert(await rejects(() => decodeSFXSample(contextDecoding(MAX_SFX_SAMPLE_SECONDS + 1, calls), new ArrayBuffer(16), 'a', 'long.wav'), /duration/), 'over-long sample accepted');
    }],
    ['in-range sample decodes into an asset', async () => {
      const calls = { decoded: 0 };
      const decoded = await decodeSFXSample(contextDecoding(2, calls), new ArrayBuffer(16), 'a', 'hit.wav');
      assert(decoded.asset.channels === 2 && decoded.asset.lengthSamples === 96000 && calls.decoded === 1, 'asset metadata wrong');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
