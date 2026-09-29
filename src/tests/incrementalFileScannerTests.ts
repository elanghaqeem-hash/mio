import { FileScanCache } from '../file-intelligence/FileScanCache';
import { FileScanController } from '../file-intelligence/FileScanController';
import { BoundedFileScanner, type ReadOnlyFileScanSource } from '../file-intelligence/BoundedFileScanner';

interface SuiteResult { passed: number; total: number; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runIncrementalFileScannerTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`IncrementalFileScanner test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  let headerReads = 0;
  let hashReads = 0;
  const source: ReadOnlyFileScanSource = {
    listDirectory: async () => [{ name: 'stable.png', type: 'FILE', bytes: 28, modifiedAtMs: 100 }],
    readFileHeader: async () => {
      headerReads += 1;
      return { bytes: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, ...new Array(20).fill(0)], fileBytes: 28 };
    },
    hashFile: async () => {
      hashReads += 1;
      return { sha256: 'd'.repeat(64), bytes: 28, modifiedAtMs: 100 };
    },
  };
  const cache = new FileScanCache();
  const scanner = new BoundedFileScanner(source, cache);
  const request = { workspaceId: 'ws_cache', relativePath: '.', depth: 'FAST' as const, recursive: false, inspectSignatures: true, hashFiles: true };
  await scanner.scan(request);
  await scanner.scan(request);
  check(headerReads === 1 && hashReads === 1 && cache.size === 1, 'Unchanged file reuses cached signature and hash evidence');

  const returned = cache.get({ workspaceId: 'ws_cache', relativePath: 'stable.png', bytes: 28, modifiedAtMs: 100 });
  if (returned) returned.metadata.sha256 = 'tampered';
  const reread = cache.get({ workspaceId: 'ws_cache', relativePath: 'stable.png', bytes: 28, modifiedAtMs: 100 });
  check(reread?.metadata.sha256 === 'd'.repeat(64), 'Cache returns immutable clones instead of shared mutable scan state');
  check(cache.invalidateWorkspace('ws_cache') === 1 && cache.size === 0, 'Workspace cache can be revoked as a unit');

  let listed = false;
  const pausedSource: ReadOnlyFileScanSource = {
    listDirectory: async () => {
      listed = true;
      return [{ name: 'resume.txt', type: 'FILE', bytes: 1 }];
    },
  };
  const controller = new FileScanController();
  controller.pause();
  const pending = new BoundedFileScanner(pausedSource).scan({ workspaceId: 'ws_pause', relativePath: '.', depth: 'FAST', recursive: false }, undefined, controller);
  await delay(5);
  check(!listed && controller.state === 'PAUSED', 'Paused scan does not advance filesystem traversal');
  controller.resume();
  const resumed = await pending;
  check(listed && resumed.files.length === 1 && controller.state === 'RUNNING', 'Resume continues from cooperative checkpoint');

  const cancelled = new FileScanController();
  cancelled.pause();
  const cancelledRun = new BoundedFileScanner(pausedSource).scan({ workspaceId: 'ws_cancel', relativePath: '.', depth: 'FAST', recursive: false }, undefined, cancelled);
  cancelled.cancel();
  let cancelledCorrectly = false;
  try { await cancelledRun; } catch (error) { cancelledCorrectly = error instanceof DOMException && error.name === 'AbortError'; }
  check(cancelledCorrectly && cancelled.state === 'CANCELLED', 'Cancel releases paused scan into terminal AbortError');

  return { passed, total };
}
