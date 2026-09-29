export interface PerceptualFingerprint {
  algorithm: 'dhash-64-v1';
  hex: string;
}

export interface SimilarityItem {
  id: string;
  fingerprint: PerceptualFingerprint;
}

export interface SimilarityCluster {
  memberIds: string[];
}

export function createDifferenceHash(grayscale9x8: Uint8Array): PerceptualFingerprint {
  if (grayscale9x8.length !== 72) throw new Error('dHash requires exactly a 9x8 grayscale sample');
  let value = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (grayscale9x8[y * 9 + x] > grayscale9x8[y * 9 + x + 1]) value |= 1n << bit;
      bit += 1n;
    }
  }
  return { algorithm: 'dhash-64-v1', hex: value.toString(16).padStart(16, '0') };
}

function parse(fp: PerceptualFingerprint): bigint {
  if (fp.algorithm !== 'dhash-64-v1' || !/^[0-9a-f]{16}$/i.test(fp.hex)) throw new Error('Invalid perceptual fingerprint');
  return BigInt(`0x${fp.hex}`);
}

export function perceptualDistance(a: PerceptualFingerprint, b: PerceptualFingerprint): number {
  let xor = parse(a) ^ parse(b);
  let count = 0;
  while (xor) { count += Number(xor & 1n); xor >>= 1n; }
  return count;
}

export function perceptualSimilarity(a: PerceptualFingerprint, b: PerceptualFingerprint): number {
  return Number((1 - perceptualDistance(a, b) / 64).toFixed(6));
}

export function clusterPerceptualSimilarity(items: readonly SimilarityItem[], maxDistance = 8): SimilarityCluster[] {
  if (!Number.isSafeInteger(maxDistance) || maxDistance < 0 || maxDistance > 64) throw new Error('maxDistance must be an integer between 0 and 64');
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const parent = ordered.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  for (let i = 0; i < ordered.length; i += 1) for (let j = i + 1; j < ordered.length; j += 1) {
    if (perceptualDistance(ordered[i].fingerprint, ordered[j].fingerprint) <= maxDistance) union(i, j);
  }
  const groups = new Map<number, string[]>();
  ordered.forEach((item, i) => { const root = find(i); groups.set(root, [...(groups.get(root) ?? []), item.id]); });
  return [...groups.values()].map((memberIds) => ({ memberIds })).sort((a, b) => a.memberIds[0].localeCompare(b.memberIds[0]));
}
