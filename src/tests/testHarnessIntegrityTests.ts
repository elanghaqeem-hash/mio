import fs from 'node:fs';
import path from 'node:path';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };

// MIO-PRV-00.02: every exported test runner must execute in CI. A suite that is
// imported but missing from the runners array silently never runs.
export function runTestHarnessIntegrityTests(): { passed: number; total: number } {
  const testsDir = path.join(process.cwd(), 'src', 'tests');
  const harness = fs.readFileSync(path.join(testsDir, 'runAllTests.ts'), 'utf8');
  const runnersBlock = /const runners = \[([\s\S]*?)\];/.exec(harness)?.[1] ?? '';
  const registeredEntries = [...runnersBlock.matchAll(/\b(run[A-Za-z0-9_]+)\b/g)].map(match => match[1]);
  const registered = new Set(registeredEntries);
  const exported: string[] = [];
  for (const file of fs.readdirSync(testsDir).filter(name => name.endsWith('.ts') && name !== 'runAllTests.ts')) {
    const source = fs.readFileSync(path.join(testsDir, file), 'utf8');
    for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(run[A-Za-z0-9_]+)/g)) exported.push(match[1]);
  }
  const tests: Array<[string, () => void]> = [
    ['runners array is parseable', () => assert(registered.size > 0, 'runners array not found in runAllTests.ts')],
    ['every exported test runner is registered', () => {
      const missing = exported.filter(name => !registered.has(name));
      assert(missing.length === 0, `Unregistered test runners: ${missing.join(', ')}`);
    }],
    ['no runner is registered twice', () => {
      const duplicates = registeredEntries.filter((name, index) => registeredEntries.indexOf(name) !== index);
      assert(duplicates.length === 0, `Duplicate runners: ${duplicates.join(', ')}`);
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
