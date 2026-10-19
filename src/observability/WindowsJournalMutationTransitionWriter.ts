/**
 * PRV-11.03j — fail-closed logical mutation transition writer for the
 * non-production Windows journal. Does not attest physical power-loss durability.
 */
import { WindowsJournalWriterPrototype } from './WindowsJournalWriterPrototype';
import { inspectJournalMutationCommit, type JournalMutationPhase, type JournalMutationReview } from './WindowsJournalCommitVerifier';
import type { JournalPrototypeEntry } from './WindowsCheckpointJournalPrototype';

export interface JournalMutationIdentity { projectId: string; taskId: string; requestId: string }
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const fail = (code: string): never => { throw new Error(code); };
const KEY = (identity: JournalMutationIdentity) => JSON.stringify([identity.projectId, identity.taskId, identity.requestId]);
const validateIdentity = (identity: JournalMutationIdentity) => {
  if (!identity || ![identity.projectId, identity.taskId, identity.requestId].every(x => typeof x === 'string' && ID.test(x)))
    fail('WINDOWS_JOURNAL_TRANSITION_IDENTITY_INVALID');
};
interface State { sequence: number; phase: JournalMutationPhase }
function readHistory(entries: readonly JournalPrototypeEntry[]): Map<string, State> {
  // The verifier validates ALL entries, not only those for the requested identity.
  // A fixed valid but absent identity is used for global history validation.
  inspectJournalMutationCommit(entries, { projectId: 'journal_validation', taskId: 'journal_validation', requestId: 'journal_validation' });
  const states = new Map<string, State>();
  for (const entry of entries) {
    const item = JSON.parse(entry.json) as JournalMutationIdentity & { sequence: number; phase: JournalMutationPhase };
    states.set(KEY(item), { sequence: item.sequence, phase: item.phase });
  }
  return states;
}
export class WindowsJournalMutationTransitionWriter {
  private readonly writer: WindowsJournalWriterPrototype;
  private quarantined = false;
  constructor(filename: string) {
    this.writer = new WindowsJournalWriterPrototype(filename);
    try { readHistory(this.writer.inspect()); }
    catch (error) { this.quarantined = true; throw error; } // Keep lock for review.
  }
  append(identity: JournalMutationIdentity, phase: JournalMutationPhase): JournalPrototypeEntry {
    if (this.quarantined) fail('WINDOWS_JOURNAL_TRANSITION_REVIEW_REQUIRED');
    validateIdentity(identity);
    if (!['PREPARED', 'EXECUTING', 'COMMITTED', 'UNCERTAIN'].includes(phase))
      fail('WINDOWS_JOURNAL_TRANSITION_PHASE_INVALID');
    let entries: JournalPrototypeEntry[];
    let state: State | undefined;
    try {
      entries = this.writer.inspect();
      state = readHistory(entries).get(KEY(identity));
    } catch (error) {
      this.quarantined = true;
      throw error;
    }
    const valid = !state ? phase === 'PREPARED'
      : state.phase === 'PREPARED' ? phase === 'EXECUTING' || phase === 'UNCERTAIN'
      : state.phase === 'EXECUTING' ? phase === 'COMMITTED' || phase === 'UNCERTAIN'
      : false;
    if (!valid) fail('WINDOWS_JOURNAL_TRANSITION_DENIED');
    const payload = JSON.stringify({
      version: 1, ...identity, sequence: (state?.sequence ?? 0) + 1,
      phase, previousDigest: entries.at(-1)?.digest ?? null,
    });
    try {
      const written = this.writer.append(payload);
      // Verify the entire logical chain including the newly appended event.
      readHistory(this.writer.inspect());
      return written;
    } catch (error) {
      this.quarantined = true;
      throw error;
    }
  }
  review(identity: JournalMutationIdentity): JournalMutationReview {
    validateIdentity(identity);
    if (this.quarantined) fail('WINDOWS_JOURNAL_TRANSITION_REVIEW_REQUIRED');
    try { return inspectJournalMutationCommit(this.writer.inspect(), identity); }
    catch (error) { this.quarantined = true; throw error; }
  }
  close(): void {
    if (this.quarantined) fail('WINDOWS_JOURNAL_TRANSITION_REVIEW_REQUIRED');
    this.writer.close();
  }
}
