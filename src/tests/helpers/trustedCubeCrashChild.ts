/**
 * Isolated MioBench fault-injection CHILD process.
 * Only launched with a fresh, test-created temp root by parent tests.
 * Intentional process.exit simulates abrupt termination (not physical power loss).
 */
import { createTrustedNodeCreativeExecutor } from '../../observability/TrustedNodeCreativeExecutor';
import { TrustedCubeSceneAdapter } from '../../observability/TrustedCubeSceneAdapter';

const root = process.argv[2];
const mode = process.argv[3];
if (!root || !['before-effect', 'after-effect', 'normal', 'approval-denied'].includes(mode))
  throw new Error('MIO_BENCH_CHILD_ARGUMENT_INVALID');

const command = { schemaVersion: 1 as const, projectId: 'ws_bench', taskId: 'task_bench', requestId: 'request_bench',
  mode: '3D' as const, templateId: 'primitive_cube_v1' };

async function run() {
  const base = new TrustedCubeSceneAdapter(root, async () => mode !== 'approval-denied');
  const adapter = {
    authorize: (input: typeof command) => base.authorize(input),
    execute: async (input: typeof command) => {
      if (mode === 'before-effect') process.exit(73);
      const asset = await base.execute(input);
      if (mode === 'after-effect') process.exit(74);
      return asset;
    },
  };
  const runtime = createTrustedNodeCreativeExecutor(root, adapter);
  const result = await runtime.invoke(command);
  if (mode === 'normal' && (!result.success || result.status !== 'COMMITTED')) process.exit(81);
  if (mode === 'approval-denied' && result.success) process.exit(82);
  runtime.close();
}
run().catch(() => { process.exitCode = 90; });
