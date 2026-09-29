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

  const policySource: ReadOnlyFileScanSource = {
    listDirectory: async (_workspaceId, relativePath) => relativePath === '.'
      ? [
          { name: '.secret', type: 'FILE', bytes: 1 },
          { name: '.git', type: 'DIRECTORY' },
          { name: 'node_modules', type: 'DIRECTORY' },
          { name: 'cache.tmp', type: 'FILE', bytes: 1 },
          { name: 'keep.png', type: 'FILE', bytes: 2 },
          { name: 'nested', type: 'DIRECTORY' },
        ]
      : relativePath === 'nested'
        ? [{ name: 'deep.jpg', type: 'FILE', bytes: 3 }]
        : [],
  };
  const policyScanner = new BoundedFileScanner(policySource);
  const policyResult = await policyScanner.scan({
    workspaceId: 'ws_policy',
    relativePath: '.',
    depth: 'FAST',
    recursive: true,
    excludeExtensions: ['tmp'],
  });
  check(policyResult.files.map((file) => file.identity.relativePath).join('|') === 'keep.png|nested/deep.jpg', 'Default policy skips hidden/system-heavy paths and configured extensions');
  check(policyResult.skippedCount === 4, 'Policy exclusions are counted as skipped entries');

  const hiddenResult = await policyScanner.scan({
    workspaceId: 'ws_policy',
    relativePath: '.',
    depth: 'FAST',
    recursive: false,
    includeHidden: true,
    excludeNames: ['keep.png'],
  });
  check(hiddenResult.files.some((file) => file.identity.name === '.secret') && !hiddenResult.files.some((file) => file.identity.name === 'keep.png'), 'Hidden-file inclusion is explicit and custom name exclusions remain authoritative');

  check(await rejects(() => policyScanner.scan({
    workspaceId: 'ws_policy',
    relativePath: '.',
    depth: 'FAST',
    recursive: true,
    maxDepth: 1,
  }), 'traversal depth') === false, 'Configured depth one permits exactly one nested directory level');

  const depthSource: ReadOnlyFileScanSource = {
    listDirectory: async (_workspaceId, relativePath) =>
      relativePath === '.' ? [{ name: 'a', type: 'DIRECTORY' }]
      : relativePath === 'a' ? [{ name: 'b', type: 'DIRECTORY' }]
      : relativePath === 'a/b' ? [{ name: 'too-deep.txt', type: 'FILE', bytes: 1 }]
      : [],
  };
  check(await rejects(() => new BoundedFileScanner(depthSource).scan({
    workspaceId: 'ws_depth',
    relativePath: '.',
    depth: 'FAST',
    recursive: true,
    maxDepth: 1,
  }), 'traversal depth'), 'Configured maximum traversal depth is enforced');

  const evidenceSource: ReadOnlyFileScanSource = {
    listDirectory: async () => [{ name: 'renamed.jpg', type: 'FILE', bytes: 28, modifiedAtMs: 100 }],
    readFileHeader: async () => ({
      bytes: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, ...new Array(20).fill(0)],
      fileBytes: 28,
    }),
    hashFile: async () => ({ sha256: 'a'.repeat(64), bytes: 28, modifiedAtMs: 100 }),
  };
  const evidenceResult = await new BoundedFileScanner(evidenceSource).scan({
    workspaceId: 'ws_evidence',
    relativePath: '.',
    depth: 'FAST',
    recursive: false,
    inspectSignatures: true,
    hashFiles: true,
  });
  const evidence = evidenceResult.files[0];
  check(evidence.identity.mimeType === 'image/png' && evidence.identity.kind === 'IMAGE', 'Signature evidence overrides misleading extension for asset classification');
  check(evidence.metadata.extensionConsistent === false && evidence.metadata.sha256 === 'a'.repeat(64), 'Scan persists extension mismatch and SHA-256 evidence');

  const duplicateSource: ReadOnlyFileScanSource = {
    listDirectory: async () => [
      { name: 'copy-a.txt', type: 'FILE', bytes: 4, modifiedAtMs: 1 },
      { name: 'copy-b.txt', type: 'FILE', bytes: 4, modifiedAtMs: 1 },
    ],
    hashFile: async () => ({ sha256: 'b'.repeat(64), bytes: 4, modifiedAtMs: 1 }),
  };
  const duplicateResult = await new BoundedFileScanner(duplicateSource).scan({
    workspaceId: 'ws_duplicates', relativePath: '.', depth: 'FAST', recursive: false, hashFiles: true,
  });
  check(duplicateResult.files[0].metadata.sha256 === duplicateResult.files[1].metadata.sha256, 'Exact duplicate fingerprint is represented by identical SHA-256 evidence');

  const changedSource: ReadOnlyFileScanSource = {
    listDirectory: async () => [{ name: 'changing.txt', type: 'FILE', bytes: 4, modifiedAtMs: 1 }],
    hashFile: async () => ({ sha256: 'c'.repeat(64), bytes: 5, modifiedAtMs: 2 }),
  };
  check(await rejects(() => new BoundedFileScanner(changedSource).scan({
    workspaceId: 'ws_changed', relativePath: '.', depth: 'FAST', recursive: false, hashFiles: true,
  }), 'changed during scan'), 'Changed-file detection rejects stale discovery metadata');

  return { passed, total };
}
