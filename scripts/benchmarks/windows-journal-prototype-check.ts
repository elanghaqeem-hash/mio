import { runWindowsJournalProvisioningInspectionTests } from '../../src/tests/windowsJournalProvisioningInspectionTests';
import { runWindowsJournalCommitVerifierTests } from '../../src/tests/windowsJournalCommitVerifierTests';
import { runWindowsJournalInterprocessTests } from '../../src/tests/windowsJournalInterprocessTests';
import { runWindowsJournalWriterPrototypeTests } from '../../src/tests/windowsJournalWriterPrototypeTests';
import { runWindowsCheckpointJournalPrototypeTests } from '../../src/tests/windowsCheckpointJournalPrototypeTests';
async function main() {
  if (process.platform !== 'win32') throw Error('WINDOWS_JOURNAL_TEST_REQUIRES_NATIVE_WINDOWS');
  const result = await runWindowsCheckpointJournalPrototypeTests();
  if (result.passed !== 4 || result.total !== 4) throw Error('WINDOWS_JOURNAL_PROTOTYPE_INCOMPLETE');
  const coordination = await runWindowsJournalWriterPrototypeTests();
  if (coordination.passed !== 4 || coordination.total !== 4) throw Error('WINDOWS_JOURNAL_WRITER_COORDINATION_INCOMPLETE');
  const independent = await runWindowsJournalInterprocessTests();
  if (independent.passed !== 2 || independent.total !== 2) throw Error('WINDOWS_JOURNAL_INTERPROCESS_INCOMPLETE');
  const commit = await runWindowsJournalCommitVerifierTests();
  if (commit.passed !== 6 || commit.total !== 6) throw Error('WINDOWS_JOURNAL_COMMIT_LOGIC_INCOMPLETE');
  const provisioning = await runWindowsJournalProvisioningInspectionTests();
  if (provisioning.total !== 5 || provisioning.passed !== 5) throw Error('WINDOWS_PROVISIONING_DIAGNOSTICS_INCOMPLETE');
  console.log('WINDOWS JOURNAL PROTOTYPE PASS', JSON.stringify({
    platform: process.platform, tested: result.total + coordination.total + independent.total + commit.total + provisioning.total,
    scope: 'preprovisioned file append/fsync/hash-chain correctness',
    durableDirectoryPublication: false,
    runtimeActivation: false,
  }));
}
main().catch(e => { console.error('WINDOWS JOURNAL PROTOTYPE FAIL',e); process.exitCode=1; });
