/**
 * PRV-11.03d — Non-production exclusive writer coordinator for an EXISTING
 * Windows journal prototype. It is deliberately NOT wired to the creative runtime.
 *
 * A newly created lock-file cannot claim power-loss-safe directory publication.
 * Stale locks are never reclaimed. No automatic replay, truncate or repair.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WindowsCheckpointJournalPrototype, type JournalPrototypeEntry } from './WindowsCheckpointJournalPrototype';

const fail = (message: string): never => { throw new Error(message); };
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

export class WindowsJournalWriterPrototype {
  private readonly lockPath: string;
  private readonly fd: number;
  private closed = false;
  private compromised = false;
  private active = false;
  private readonly journal: WindowsCheckpointJournalPrototype;

  constructor(journalPath: string) {
    if (!path.isAbsolute(journalPath) || path.basename(journalPath).length < 2)
      fail('WINDOWS_JOURNAL_WRITER_PATH_INVALID');
    const folder = path.dirname(journalPath);
    const folderStat = fs.lstatSync(folder);
    const journalStat = fs.lstatSync(journalPath);
    if (!folderStat.isDirectory() || folderStat.isSymbolicLink() ||
        !journalStat.isFile() || journalStat.isSymbolicLink())
      fail('WINDOWS_JOURNAL_WRITER_UNSAFE');
    this.lockPath = journalPath + '.writer.lock';
    let fd: number;
    try {
      fd = fs.openSync(this.lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | NOFOLLOW, 0o600);
    } catch { fail('WINDOWS_JOURNAL_WRITER_ALREADY_LOCKED_OR_UNAVAILABLE'); }
    this.fd = fd;
    try {
      fs.writeFileSync(fd, JSON.stringify({version:1,pid:process.pid}));
      fs.fsyncSync(fd);
      this.journal = new WindowsCheckpointJournalPrototype(journalPath);
      // Validate the full history BEFORE admitting any append. Bad history
      // quarantines the lock so that external intervention is necessary.
      this.journal.inspect();
    } catch (error) {
      this.compromised = true;
      try { fs.closeSync(fd); } catch { /* preserve lock */ }
      throw error;
    }
  }

  append(json: string): JournalPrototypeEntry {
    if (this.closed || this.compromised || this.active) fail('WINDOWS_JOURNAL_WRITER_STOPPED_OR_BUSY');
    this.active = true;
    try {
      return this.journal.append(json);
    } catch (error) {
      this.compromised = true;
      throw error;
    } finally { this.active = false; }
  }

  inspect(): JournalPrototypeEntry[] {
    if (this.closed || this.compromised) fail('WINDOWS_JOURNAL_WRITER_REVIEW_REQUIRED');
    return this.journal.inspect();
  }

  /** Orderly release is impossible after uncertain writes or detected corruption. */
  close(): void {
    if (this.closed) return;
    if (this.active || this.compromised) fail('WINDOWS_JOURNAL_WRITER_REVIEW_REQUIRED');
    const held = fs.fstatSync(this.fd);
    const current = fs.lstatSync(this.lockPath);
    if (!current.isFile() || current.isSymbolicLink() ||
        held.dev !== current.dev || held.ino !== current.ino)
      fail('WINDOWS_JOURNAL_WRITER_LOCK_CHANGED');
    this.closed = true;
    fs.closeSync(this.fd);
    // Windows may refuse unlink of an OPEN lock. Close first, then unlink.
    // Lock remains occupied until unlink completes; no stale lock stealing.
    fs.unlinkSync(this.lockPath);
  }
}
