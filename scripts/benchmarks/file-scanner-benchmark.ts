import { performance } from 'node:perf_hooks';
import { BoundedFileScanner, type ReadOnlyFileScanSource } from '../../src/file-intelligence/BoundedFileScanner';

const FILE_COUNT = Number(process.env.MIO_SCAN_BENCH_FILES ?? 5000);
const ITERATIONS = Number(process.env.MIO_SCAN_BENCH_ITERATIONS ?? 5);

if (!Number.isSafeInteger(FILE_COUNT) || FILE_COUNT <= 0 || FILE_COUNT > 5000) {
  throw new Error('MIO_SCAN_BENCH_FILES must be an integer between 1 and 5000');
}
if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS <= 0 || ITERATIONS > 50) {
  throw new Error('MIO_SCAN_BENCH_ITERATIONS must be an integer between 1 and 50');
}

const entries = Array.from({ length: FILE_COUNT }, (_, index) => ({
  name: `asset-${String(index).padStart(5, '0')}.${index % 4 === 0 ? 'jpg' : index % 4 === 1 ? 'mp4' : index % 4 === 2 ? 'pdf' : 'txt'}`,
  type: 'FILE' as const,
  bytes: 1024 + (index % 8192),
  modifiedAtMs: 1_700_000_000_000 + index,
}));

const source: ReadOnlyFileScanSource = {
  listDirectory: async (workspaceId, relativePath) => {
    if (workspaceId !== 'ws_benchmark' || relativePath !== '.') throw new Error('Unexpected benchmark scope');
    return entries;
  },
};

const scanner = new BoundedFileScanner(source);
const durations: number[] = [];

for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
  const started = performance.now();
  const result = await scanner.scan({
    workspaceId: 'ws_benchmark',
    relativePath: '.',
    depth: 'FAST',
    recursive: false,
    maxFiles: FILE_COUNT,
  });
  durations.push(performance.now() - started);
  if (result.files.length !== FILE_COUNT) throw new Error('Benchmark scan returned an unexpected file count');
}

const sorted = [...durations].sort((a, b) => a - b);
const medianMs = sorted[Math.floor(sorted.length / 2)];
const totalMs = durations.reduce((sum, value) => sum + value, 0);
const filesPerSecond = Math.round((FILE_COUNT * ITERATIONS * 1000) / totalMs);

console.log(JSON.stringify({
  benchmark: 'mio-bounded-file-scanner-v1',
  fileCount: FILE_COUNT,
  iterations: ITERATIONS,
  medianMs: Number(medianMs.toFixed(2)),
  averageMs: Number((totalMs / ITERATIONS).toFixed(2)),
  filesPerSecond,
  note: 'Synthetic metadata benchmark; excludes real disk I/O and media decoding.',
}, null, 2));
