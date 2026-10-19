/**
 * Dedicated PRV-11.03 platform acceptance runner.
 * Executes actual child-process crash scenarios; rejects skipped tests.
 */
import { runMioBenchTrustedCubeCrashTests } from '../../src/tests/mioBenchTrustedCubeCrashTests';

async function main() {
  const result = await runMioBenchTrustedCubeCrashTests();
  if (result.passed !== result.total || result.total !== 4)
    throw Error('MIO_CROSS_PLATFORM_MATRIX_INCOMPLETE');
  console.log('MIO CROSS-PLATFORM CRASH GATE: PASS', JSON.stringify({
    platform: process.platform, arch: process.arch, node: process.version,
    passed: result.passed, total: result.total,
    scope: 'real Node subprocess termination, checkpoint and cube asset recovery',
    powerLossTested: false, electronGuiTested: false,
  }));
}
main().catch(e => {
  console.error('MIO CROSS-PLATFORM CRASH GATE: FAIL',process.platform,e);
  process.exitCode = 1;
});
