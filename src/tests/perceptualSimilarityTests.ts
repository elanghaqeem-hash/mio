import { clusterPerceptualSimilarity, createDifferenceHash, perceptualDistance, perceptualSimilarity } from '../file-intelligence/PerceptualSimilarity';

interface SuiteResult { passed: number; total: number; }

export async function runPerceptualSimilarityTests(): Promise<SuiteResult> {
  let passed = 0, total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`PerceptualSimilarity test failed: ${label}`);
    passed += 1; console.log(`✓ [PASS] ${label}`);
  };

  const gradient = new Uint8Array(72);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) gradient[y * 9 + x] = x * 20;
  const same = new Uint8Array(gradient);
  const inverse = new Uint8Array(72);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) inverse[y * 9 + x] = 255 - x * 20;

  const a = createDifferenceHash(gradient), b = createDifferenceHash(same), c = createDifferenceHash(inverse);
  check(a.hex.length === 16 && a.algorithm === 'dhash-64-v1', 'dHash produces canonical 64-bit fingerprint');
  check(perceptualDistance(a, b) === 0 && perceptualSimilarity(a, b) === 1, 'Identical perceptual samples have zero distance');
  check(perceptualDistance(a, c) === 64 && perceptualSimilarity(a, c) === 0, 'Opposite gradients have maximal dHash distance');

  const oneBit = { algorithm: 'dhash-64-v1' as const, hex: '0000000000000001' };
  const zero = { algorithm: 'dhash-64-v1' as const, hex: '0000000000000000' };
  const far = { algorithm: 'dhash-64-v1' as const, hex: 'ffffffffffffffff' };
  const clusters = clusterPerceptualSimilarity([
    { id: 'b', fingerprint: oneBit }, { id: 'c', fingerprint: far }, { id: 'a', fingerprint: zero },
  ], 2);
  check(clusters.length === 2 && clusters[0].memberIds.join(',') === 'a,b' && clusters[1].memberIds[0] === 'c', 'Similarity clustering is deterministic and groups nearby fingerprints');

  let rejected = false;
  try { createDifferenceHash(new Uint8Array(71)); } catch { rejected = true; }
  check(rejected, 'dHash rejects malformed sample dimensions');

  return { passed, total };
}
