import { runWindowsCheckpointJournalPrototypeTests } from '../../src/tests/windowsCheckpointJournalPrototypeTests';
async function main() {
  if (process.platform !== 'win32') throw Error('WINDOWS_JOURNAL_TEST_REQUIRES_NATIVE_WINDOWS');
  const result = await runWindowsCheckpointJournalPrototypeTests();
  if (result.passed !== 4 || result.total !== 4) throw Error('WINDOWS_JOURNAL_PROTOTYPE_INCOMPLETE');
  console.log('WINDOWS JOURNAL PROTOTYPE PASS', JSON.stringify({
    platform: process.platform, tested: result.total,
    scope: 'preprovisioned file append/fsync/hash-chain correctness',
    durableDirectoryPublication: false,
    runtimeActivation: false,
  }));
}
main().catch(e => { console.error('WINDOWS JOURNAL PROTOTYPE FAIL',e); process.exitCode=1; });
