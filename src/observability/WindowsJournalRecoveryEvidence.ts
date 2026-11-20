/** PRV-11.04h: read-only recovery evidence, never a recovery authorization. */
import * as crypto from 'node:crypto';
import { decodeJournalRecords, MAX_JOURNAL } from './WindowsJournalBinaryCodec';
import { inspectJournalMutationCommit } from './WindowsJournalCommitVerifier';
export interface RecoveryEvidence {
  readonly status: 'REVIEW_REQUIRED' | 'INVALID_HISTORY';
  readonly journalSha256: string | null;
  readonly recordCount: number | null;
  readonly recordedState: 'NOT_FOUND' | 'REVIEW_REQUIRED' | 'LOGICALLY_COMMITTED' | null;
  readonly automaticReplayPermitted: false;
  readonly lockReleasePermitted: false;
  readonly runtimeActivationPermitted: false;
}
export function inspectRecoveryEvidence(bytes: Buffer, identity: {projectId:string;taskId:string;requestId:string}): RecoveryEvidence {
  const denied = {automaticReplayPermitted:false,lockReleasePermitted:false,runtimeActivationPermitted:false} as const;
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_JOURNAL)
    return {...denied,status:'INVALID_HISTORY',journalSha256:null,recordCount:null,recordedState:null};
  const snapshot=Buffer.from(bytes);
  const journalSha256=crypto.createHash('sha256').update(snapshot).digest('hex');
  try {
    const {entries}=decodeJournalRecords(snapshot);
    const result=inspectJournalMutationCommit(entries,identity);
    return {...denied,status:'REVIEW_REQUIRED',journalSha256,recordCount:entries.length,recordedState:result.status};
  } catch {
    return {...denied,status:'INVALID_HISTORY',journalSha256,recordCount:null,recordedState:null};
  }
}
