import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTrustedNodeCreativeExecutor } from '../observability/TrustedNodeCreativeExecutor';
import { TrustedCubeSceneAdapter } from '../observability/TrustedCubeSceneAdapter';
import { MioCheckpointPersistence } from '../observability/MioCheckpointPersistence';
import { NodeFileCheckpointStorage } from '../observability/NodeFileCheckpointStorage';
import { inspectTrustedCubeArtifact } from '../observability/TrustedCubeArtifactInspector';

type CrashMode = 'normal' | 'approval-denied' | 'before-effect' | 'after-effect';
const input = { schemaVersion: 1 as const, projectId: 'ws_bench', taskId: 'task_bench',
  requestId: 'request_bench', mode: '3D' as const, templateId: 'primitive_cube_v1' };
const identity = { projectId: input.projectId, taskId: input.taskId, requestId: input.requestId };
const insist = (value: unknown, error: string): void => { if (!value) throw new Error(error); };

function fork(root: string, mode: CrashMode): number | null {
  const child = spawnSync(process.execPath, ['--import', 'tsx', path.resolve('src/tests/helpers/trustedCubeCrashChild.ts'), root, mode], {
    cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8', timeout: 20000,
  });
  if (child.error) throw new Error('Child fault-injection runner unavailable: ' + child.error.message);
  return child.status;
}

const lockAt = (root: string): string => path.join(root, 'mio-runtime-checkpoints-v1', '.exclusive-writer.lock');
const artifactCount = (root: string): number => {
  const base = path.join(root, 'mio-trusted-3d-v1');
  if (!fs.existsSync(base)) return 0;
  return fs.readdirSync(base).reduce((sum, folder) => sum + fs.readdirSync(path.join(base, folder)).length, 0);
};
const checkpointState = async (root: string) => {
  const store = await new MioCheckpointPersistence(new NodeFileCheckpointStorage(root)).load(input.projectId);
  return store.get({ projectId: input.projectId, taskId: input.taskId, actionId: input.requestId });
};

export async function runMioBenchTrustedCubeCrashTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['MioBench child: denied consent never writes asset or checkpoint', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-bench-deny-'));
      try {
        insist(fork(root, 'approval-denied') === 0, 'denied consent child did not exit normally');
        insist(artifactCount(root) === 0, 'asset created without consent');
        insist(!(await checkpointState(root)), 'checkpoint created without consent');
        insist(!fs.existsSync(lockAt(root)), 'normal denial failed to release runtime lock');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['MioBench child: successful actual asset and durable COMMITTED checkpoint survive restart', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-bench-commit-'));
      try {
        insist(fork(root, 'normal') === 0, 'normal child run failed');
        insist(!fs.existsSync(lockAt(root)), 'graceful child left writer lock');
        insist(artifactCount(root) === 1, 'committed scene missing');
        insist((await checkpointState(root))?.state === 'COMMITTED', 'committed checkpoint not durable');
        const inspected = inspectTrustedCubeArtifact(root, identity);
        insist(inspected.success && inspected.scene.objects[0].mesh?.faces.length === 6, 'persisted geometry not verifiable');
        let executed = 0;
        const second = createTrustedNodeCreativeExecutor(root, new TrustedCubeSceneAdapter(root, async () => true));
        const replay = await second.invoke(input);
        insist(!replay.success && executed === 0 && artifactCount(root) === 1, 'duplicate replay admitted');
        // The resumed session is quarantined after a rejected durable BEGIN; do not forcibly remove lock.
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['MioBench child: abrupt exit before effect preserves uncertain checkpoint and blocks writer takeover', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-bench-pre-'));
      try {
        insist(fork(root, 'before-effect') === 73, 'expected intentional before-effect crash');
        insist(artifactCount(root) === 0, 'effect unexpectedly completed');
        insist((await checkpointState(root))?.state === 'UNCERTAIN', 'EXECUTING checkpoint not recovered uncertain');
        insist(fs.existsSync(lockAt(root)), 'crashed writer lock silently released');
        let refused = false;
        try { createTrustedNodeCreativeExecutor(root, new TrustedCubeSceneAdapter(root, async () => true)); }
        catch { refused = true; }
        insist(refused, 'stale writer lock automatically reclaimed');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['MioBench child: abrupt exit after real asset write never claims COMMITTED or permits replay', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-bench-post-'));
      try {
        insist(fork(root, 'after-effect') === 74, 'expected intentional after-effect crash');
        insist(artifactCount(root) === 1, 'real side effect missing after crash');
        insist((await checkpointState(root))?.state === 'UNCERTAIN', 'interrupted effect incorrectly committed');
        insist(fs.existsSync(lockAt(root)), 'stale lock missing');
        const original = fs.readFileSync(path.join(root, 'mio-runtime-checkpoints-v1', '.exclusive-writer.lock'));
        insist(original.length > 0, 'crashed writer lock metadata missing');
        // Emulate EXPLICIT OPERATOR REVIEW in isolated test root only. This must not
        // become application behavior: the lock is NEVER auto-reclaimed in production.
        fs.unlinkSync(lockAt(root));
        let executions = 0;
        const resumed = createTrustedNodeCreativeExecutor(root, {
          authorize: async () => true,
          execute: async () => { executions++; return { assetId: 'invalid_second_effect' }; },
        });
        const result = await resumed.invoke(input);
        insist(!result.success && executions === 0 && artifactCount(root) === 1,
          'UNCERTAIN mutation repeated after explicit lock release');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
