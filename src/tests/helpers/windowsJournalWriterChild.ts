/** PRV-11.03d child held writer lock across independent OS process. */
import { WindowsJournalWriterPrototype } from '../../observability/WindowsJournalWriterPrototype';
const file = process.argv[2];
const mode = process.argv[3];
if (!file || !['hold','contend','crash'].includes(mode)) process.exit(90);
try {
  const writer = new WindowsJournalWriterPrototype(file);
  if (mode === 'contend') {
    writer.close();
    process.exit(0);
  }
  process.stdout.write('LOCK_HELD\n');
  if (mode === 'crash') process.exit(77);
  process.stdin.resume();
  process.stdin.once('data', () => { writer.close(); process.exit(0); });
} catch (e) {
  process.stderr.write(String(e));
  process.exit(mode === 'contend' ? 75 : 91);
}
