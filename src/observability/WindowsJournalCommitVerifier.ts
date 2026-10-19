/**
 * PRV-11.03e — strict logical commit verification for an existing journal.
 * This does NOT attest physical power-loss durability, nor activate Windows.
 * The journal's framing/hash chain is verified independently before calling.
 */
import type { JournalPrototypeEntry } from './WindowsCheckpointJournalPrototype';

export type JournalMutationPhase = 'PREPARED' | 'EXECUTING' | 'COMMITTED' | 'UNCERTAIN';
export interface JournalMutationEvent {
  version: 1;
  projectId: string;
  taskId: string;
  requestId: string;
  sequence: number;
  phase: JournalMutationPhase;
  previousDigest: string | null;
}
export interface JournalMutationReview {
  status: 'NOT_FOUND' | 'REVIEW_REQUIRED' | 'LOGICALLY_COMMITTED';
  requestId: string;
  lastPhase?: JournalMutationPhase;
  records: number;
}
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const phases = new Set(['PREPARED','EXECUTING','COMMITTED','UNCERTAIN']);
const fail = (): never => { throw Error('WINDOWS_JOURNAL_COMMIT_HISTORY_INVALID'); };
function decode(raw: string): JournalMutationEvent {
  let item: unknown;
  try { item = JSON.parse(raw); } catch { return fail(); }
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail();
  const rec = item as Record<string,unknown>;
  const keys = ['version','projectId','taskId','requestId','sequence','phase','previousDigest'];
  if (Object.keys(rec).length !== keys.length || !keys.every(k=>Object.hasOwn(rec,k)) ||
      rec.version !== 1 || !ID.test(String(rec.projectId)) || !ID.test(String(rec.taskId)) ||
      !ID.test(String(rec.requestId)) || !Number.isSafeInteger(rec.sequence) ||
      (rec.sequence as number) < 1 || !phases.has(String(rec.phase)) ||
      !(rec.previousDigest === null || (typeof rec.previousDigest === 'string' && DIGEST.test(rec.previousDigest)))) fail();
  return rec as unknown as JournalMutationEvent;
}
/**
 * A logical COMMITTED record is evidence of the recorded state only.
 * Do not use this verdict as proof of storage flush, directory publication,
 * user authorization, durable side effect, or no-replay permission.
 */
export function inspectJournalMutationCommit(
  entries: readonly JournalPrototypeEntry[],
  identity: {projectId: string;taskId: string;requestId: string},
): JournalMutationReview {
  if (![identity.projectId,identity.taskId,identity.requestId].every(x=>typeof x==='string' && ID.test(x))) fail();
  const known = new Map<string,{ sequence:number; digest:string; phase:JournalMutationPhase }>();
  let last: JournalMutationEvent | undefined;
  let count = 0;
  let precedingDigest: string | null = null;
  for (const entry of entries) {
    if (!entry || !DIGEST.test(entry.digest) || !Number.isSafeInteger(entry.offset) || entry.offset < 0) fail();
    const event = decode(entry.json);
    // Every recorded event must carry the digest of the immediately preceding
    // physical record, independently of project, to forbid ambiguous branches.
    if (event.previousDigest !== precedingDigest) fail();
    precedingDigest = entry.digest;
    const key = JSON.stringify([event.projectId,event.taskId,event.requestId]);
    const previous = known.get(key);
    if (!previous) {
      if (event.sequence !== 1 || event.phase !== 'PREPARED') fail();
    } else {
      if (event.sequence !== previous.sequence + 1) fail();
      if ((previous.phase === 'PREPARED' && !['EXECUTING','UNCERTAIN'].includes(event.phase)) ||
          (previous.phase === 'EXECUTING' && !['COMMITTED','UNCERTAIN'].includes(event.phase)) ||
          (previous.phase !== 'PREPARED' && previous.phase !== 'EXECUTING')) fail();
    }
    known.set(key,{sequence:event.sequence,digest:entry.digest,phase:event.phase});
    if (event.projectId===identity.projectId && event.taskId===identity.taskId && event.requestId===identity.requestId) {
      last=event;count++;
    }
  }
  if (!last) return {status:'NOT_FOUND',requestId:identity.requestId,records:0};
  return {
    status:last.phase==='COMMITTED'?'LOGICALLY_COMMITTED':'REVIEW_REQUIRED',
    requestId:identity.requestId,lastPhase:last.phase,records:count,
  };
}
