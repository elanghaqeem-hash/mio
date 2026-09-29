import { BoundedFileScanner, type ReadOnlyFileScanSource } from '../file-intelligence/BoundedFileScanner';

interface SuiteResult { passed: number; total: number; }

async function rejects(action: () => Promise<unknown>, includes?: string): Promise<boolean> {
  try { await action(); return false; } catch (error) {
    if (!includes) return true;
    return error instanceof Error && error.message.toLowerCase().includes(includes.toLowerCase());
  }
}

export async function runBoundedFileScannerTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`BoundedFileScanner test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const source: ReadOnlyFileScanSource = {
    listDirectory: async (_workspaceId, relativePath) => relativePath === '.'
      ? [
          { name: 'z.mp4', type: 'FILE', bytes: 200, modifiedAtMs: 20 },
          { name: 'folder', type: 'DIRECTORY', modifiedAtMs: 10 },
          { name: 'escape', type: 'SYMLINK' },
          { name: 'a.jpg', type: 'FILE', bytes: 100, modifiedAtMs: 30 },
        ]
      : relativePath === 'folder'
        ? [{ name: 'report.pdf', type: 'FILE', bytes: 50, modifiedAtMs: 40 }]
        : [],
  };

  const scanner = new BoundedFileScanner(source);
  const result = await scanner.scan({ workspaceId: 'ws_test', relativePath: '.', depth: 'FAST', recursive: true });
  check(result.files.map((file) => file.identity.relativePath).join('|') === 'a.jpg|folder/report.pdf|z.mp4', 'Recursive scan produces deterministic canonical ordering');
  check(result.files[0].identity.kind === 'IMAGE' && result.files[1].identity.kind === 'DOCUMENT' && result.files[2].identity.kind === 'VIDEO', 'Scanner classifies multimodal assets without reading content');
  check(result.files.every((file) => file.state === 'METADATA_READY'), 'Metadata-only scan never falsely claims content analysis');
  check(result.skippedCount === 1, 'Symlinks and unsupported filesystem entries are skipped');
  check(await rejects(() => scanner.scan({ workspaceId: 'ws_test', relativePath: '.', depth: 'FAST', recursive: true, maxFiles: 2 }), 'file limit'), 'Scanner enforces bounded file count');
  check(await rejects(() => scanner.scan({ workspaceId: 'ws_test', relativePath: '.', depth: 'FAST', recursive: true, maxBytes: 120 }), 'byte budget'), 'Scanner enforces bounded byte budget');

  const controller = new AbortController();
  controller.abort();
  check(await rejects(() => scanner.scan({ workspaceId: 'ws_test', relativePath: '.', depth: 'SMART', recursive: true }, controller.signal), 'cancelled'), 'Scanner supports cancellation before filesystem traversal');

  let mutationCalls = 0;
  const readOnlySource: ReadOnlyFileScanSource = {
    listDirectory: async () => {
      mutationCalls += 1;
      return [{ name: 'safe.txt', type: 'FILE', bytes: 4 }];
    },
  };
  await new BoundedFileScanner(readOnlySource).scan({ workspaceId: 'ws_test', relativePath: '.', depth: 'FAST', recursive: false });
  check(mutationCalls === 1 && !('move' in readOnlySource) && !('delete' in readOnlySource), 'Scanner dependency exposes list-only authority and no mutation surface');

  return { passed, total };
}
