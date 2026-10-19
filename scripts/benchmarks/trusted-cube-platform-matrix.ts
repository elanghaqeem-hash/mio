/**
 * Dedicated PRV-11.03 platform acceptance runner.
 * Executes actual child-process crash scenarios; rejects skipped tests.
 */
import { runMioBenchTrustedCubeCrashTests } from '../../src/tests/mioBenchTrustedCubeCrashTests';
import { createExclusiveNodeCheckpointRuntime } from '../../src/observability/ExclusiveNodeCheckpointRuntime';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

async function main() {
  // This is a required negative-path acceptance on Windows, NOT crash/recovery
  // certification. Node directory fsync fails with EPERM on native Windows.
  if (process.platform === 'win32') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-win-unsupported-'));
    try {
      let error = '';
      try { createExclusiveNodeCheckpointRuntime(root); }
      catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      if (error !== 'CHECKPOINT_DURABILITY_UNSUPPORTED_WINDOWS')
        throw Error('WINDOWS_DURABILITY_GUARD_NOT_ENFORCED: ' + error);
      if (fs.existsSync(path.join(root, 'mio-runtime-checkpoints-v1', '.exclusive-writer.lock')) ||
          fs.existsSync(path.join(root, 'mio-trusted-3d-v1')))
        throw Error('WINDOWS_UNSUPPORTED_RUNTIME_CREATED_MUTATION_ARTIFACTS');
      console.log('MIO WINDOWS SAFETY GATE: PASS — unsupported durable backend blocked before lock or effect; full crash-recovery NOT TESTED');
      return;
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
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
