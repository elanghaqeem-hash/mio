/**
 * PRV-11.03h — isolated Windows journal process-death fixture.
 * Never run against an app user-data directory. Parent creates disposable journal.
 */
import { WindowsJournalWriterPrototype } from '../../observability/WindowsJournalWriterPrototype';
const filename=process.argv[2];
const mode=process.argv[3];
if (!filename || !['before-prepared','after-prepared','after-executing','after-committed'].includes(mode)) process.exit(90);
const identity={version:1 as const,projectId:'ws_restart',taskId:'task_restart',requestId:'req_restart'};
const codes={ 'before-prepared':71,'after-prepared':72,'after-executing':73,'after-committed':74 };
try {
  const writer=new WindowsJournalWriterPrototype(filename);
  if (mode==='before-prepared') process.exit(codes[mode]);
  const p=writer.append(JSON.stringify({...identity,sequence:1,phase:'PREPARED',previousDigest:null}));
  if (mode==='after-prepared') process.exit(codes[mode]);
  const e=writer.append(JSON.stringify({...identity,sequence:2,phase:'EXECUTING',previousDigest:p.digest}));
  if (mode==='after-executing') process.exit(codes[mode]);
  writer.append(JSON.stringify({...identity,sequence:3,phase:'COMMITTED',previousDigest:e.digest}));
  process.exit(codes['after-committed']);
} catch(e) {
  console.error('MIO_WINDOWS_RESTART_CHILD_ERROR',e instanceof Error ? e.stack:String(e));
  process.exit(91);
}
