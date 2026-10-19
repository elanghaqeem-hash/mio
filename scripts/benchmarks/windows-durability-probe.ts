/**
 * PRV-11.03b — Non-destructive Windows persistence capability probe.
 * This does NOT enable Windows checkpoint/creative runtime.
 * Runs exclusively in a newly created temporary directory.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

type ProbeStep = { name: string; pass: boolean; error?: string };
const check = (yes: unknown, reason: string): void => { if (!yes) throw Error(reason); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-win-fs-probe-'));
const steps: ProbeStep[] = [];
function step(name: string, run: () => void): void {
  try { run(); steps.push({ name, pass: true }); }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    steps.push({ name, pass: false, error: reason.slice(0, 240) });
  }
}
function fileFlush(name: string, contents: string): void {
  const descriptor = fs.openSync(path.join(root, name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(descriptor, contents); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}
try {
  step('exclusive-create-and-file-fsync', () => {
    fileFlush('lock', crypto.randomBytes(16).toString('hex'));
    let collision = false;
    try { fs.openSync(path.join(root, 'lock'), fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600); }
    catch (error) { collision = (error as NodeJS.ErrnoException).code === 'EEXIST'; }
    check(collision, 'exclusive-create allowed duplicate lock');
  });
  step('file-reopen-and-content-integrity', () => {
    const before = fs.readFileSync(path.join(root, 'lock'), 'utf8');
    check(/^[a-f0-9]{32}$/.test(before), 'flushed file was not readable');
  });
  step('atomic-same-volume-rename-after-file-fsync', () => {
    fileFlush('checkpoint.new', 'checkpoint-v1');
    fs.renameSync(path.join(root, 'checkpoint.new'), path.join(root, 'checkpoint.json'));
    check(fs.readFileSync(path.join(root, 'checkpoint.json'), 'utf8') === 'checkpoint-v1', 'renamed file corrupted');
  });
  step('replace-existing-checkpoint-on-same-volume', () => {
    fileFlush('checkpoint.replace', 'checkpoint-v2');
    fs.renameSync(path.join(root, 'checkpoint.replace'), path.join(root, 'checkpoint.json'));
    check(fs.readFileSync(path.join(root, 'checkpoint.json'), 'utf8') === 'checkpoint-v2', 'replacement failed');
  });
  // This currently fails with EPERM on Windows Node CI. Its failure MUST NOT
  // be treated as proof of durability or silently suppressed in production.
  step('directory-open-and-fsync-publication', () => {
    const fd = fs.openSync(root, fs.constants.O_RDONLY);
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  });
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
const result = { platform: process.platform, arch: process.arch, node: process.version, steps };
console.log('MIO WINDOWS FS CONFORMANCE', JSON.stringify(result));
if (process.platform !== 'win32') {
  console.error('MIO_WINDOWS_PROBE_REQUIRES_NATIVE_WIN32');
  process.exitCode = 1;
} else {
  const required = steps.filter(s => s.name !== 'directory-open-and-fsync-publication');
  if (required.length !== 4 || required.some(s => !s.pass)) {
    console.error('MIO_WINDOWS_FILE_PRIMITIVES_UNSAFE');
    process.exitCode = 1;
  } else {
    console.log('MIO WINDOWS PROBE: file-level primitives verified; directory publication / crash durability remains UNVERIFIED');
  }
}
