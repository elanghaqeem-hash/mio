import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTrustedCubeScene, TrustedCubeSceneAdapter, type Trusted3DArtifact } from '../observability/TrustedCubeSceneAdapter';
import { createTrustedNodeCreativeExecutor } from '../observability/TrustedNodeCreativeExecutor';
import { validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';

const assert = (ok: unknown, message: string): void => { if (!ok) throw new Error(message); };
const command = { schemaVersion: 1 as const, mode: '3D' as const, templateId: 'primitive_cube_v1', projectId: 'project_1', taskId: 'task_1', requestId: 'build_1' };
export async function runTrustedCubeSceneAdapterTests(): Promise<{ passed: number; total: number }> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['real Mio mesh kernel creates valid nonempty 3D cube', async () => {
      const scene = createTrustedCubeScene();
      const mesh = scene.objects[0]?.mesh;
      assert(mesh?.vertices.length === 8 && mesh.faces.length === 6, 'cube geometry missing');
      assert(Boolean(mesh && validateMeshTopology(mesh).valid), 'cube topology invalid');
    }],
    ['approved command persists exact 3D scene and survives process recreation', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-trusted-cube-'));
      try {
        const runtime = createTrustedNodeCreativeExecutor(root, new TrustedCubeSceneAdapter(root, async () => true));
        const result = await runtime.invoke(command);
        assert(result.success, 'real cube scene was not committed');
        const folder = path.join(root, 'mio-trusted-3d-v1');
        const projectFolder = path.join(folder, fs.readdirSync(folder)[0]);
        const entries = fs.readdirSync(projectFolder);
        assert(entries.length === 1 && entries[0].endsWith('.mio3d.json'), 'unexpected scene storage');
        const scene = JSON.parse(fs.readFileSync(path.join(projectFolder, entries[0]), 'utf8')) as Trusted3DArtifact;
        assert(scene.kind === 'MIO_TRUSTED_3D_SCENE_V1' && scene.assetId === result.assetId &&
          scene.scene.objects[0].mesh?.faces.length === 6, 'persisted scene identity/geometry mismatch');
        assert(!(await runtime.invoke(command)).success, 'replayed same command');
        runtime.close();
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['unapproved and unknown templates cannot write a scene', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-trusted-cube-'));
      try {
        const runtime = createTrustedNodeCreativeExecutor(root, new TrustedCubeSceneAdapter(root, async () => false));
        assert(!(await runtime.invoke(command)).success, 'unapproved scene created');
        assert(!(await runtime.invoke({ ...command, requestId: 'unknown_template', templateId: 'exec_anything' })).success, 'unknown template allowed');
        assert(fs.readdirSync(path.join(root, 'mio-trusted-3d-v1')).length === 0, 'unapproved scene was stored');
        runtime.close();
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
    ['existing artifact is never overwritten by a new adapter call', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-trusted-cube-'));
      try {
        const adapter = new TrustedCubeSceneAdapter(root, async () => true);
        const first = await adapter.execute(command);
        let rejected = false;
        try { await adapter.execute(command); } catch { rejected = true; }
        assert(rejected && first.assetId.startsWith('scene_'), 'duplicate artifact overwritten');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { await run(); passed++; console.log('✓ [PASS] ' + name); }
  return { passed, total: tests.length };
}
