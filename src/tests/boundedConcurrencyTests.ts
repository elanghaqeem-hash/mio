import { mapWithConcurrency } from '../file-intelligence/BoundedConcurrency';

interface SuiteResult { passed: number; total: number; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runBoundedConcurrencyTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`BoundedConcurrency test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  let active = 0;
  let peak = 0;
  const output = await mapWithConcurrency([1,2,3,4,5,6,7,8], 3, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await delay(2);
    active -= 1;
    return value * 2;
  });
  check(peak <= 3, 'Worker pool never exceeds configured concurrency');
  check(output.join(',') === '2,4,6,8,10,12,14,16', 'Concurrent enrichment preserves deterministic input ordering');

  let rejected = false;
  try { await mapWithConcurrency([1], 17, async (value) => value); } catch { rejected = true; }
  check(rejected, 'Worker pool rejects concurrency above hard ceiling');

  return { passed, total };
}
