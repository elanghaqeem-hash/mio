import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTrustedNodeCreativeExecutor } from '../observability/TrustedNodeCreativeExecutor';
import { TrustedCubeSceneAdapter } from '../observability/TrustedCubeSceneAdapter';
import { inspectTrustedCubeArtifact } from '../observability/TrustedCubeArtifactInspector';

const assert = (v: unknown, message: string) => { if (!v) throw Error(message); };
const identity = { projectId: 'ws_123', taskId: 'task_inspect', requestId: 'scene_inspect' };
export async function runTrustedCubeArtifactInspectionTests(): Promise<{passed:number;total:number}> {
  const checks: Array<[string, () => Promise<void>]> = [
    ['only exact trusted project identity yields a verified scene', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-inspect-'));
      try {
        const runtime = createTrustedNodeCreativeExecutor(root, new TrustedCubeSceneAdapter(root, async () => true));
        const outcome = await runtime.invoke({ schemaVersion: 1, mode: '3D', templateId: 'primitive_cube_v1', ...identity });
        assert(outcome.success, 'unable to create trusted cube');
        const result = inspectTrustedCubeArtifact(root, identity);
        assert(result.success && result.assetId === outcome.assetId && result.scene.objects[0].mesh?.faces.length === 6, 'verified scene not readable');
        assert(!inspectTrustedCubeArtifact(root, {...identity, projectId:'ws_other'}).success, 'cross-project leak');
        assert(!inspectTrustedCubeArtifact(root, {...identity, requestId:'different'}).success, 'wrong request admitted');
        assert(!inspectTrustedCubeArtifact(root, {...identity, projectId:'../traversal'}).success, 'unsafe project ID admitted');
        runtime.close();
      } finally { fs.rmSync(root, {recursive:true,force:true}); }
    }],
    ['tampered mesh or artifact metadata is rejected', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-inspect-'));
      try {
        const adapter = new TrustedCubeSceneAdapter(root, async () => true);
        await adapter.execute({ schemaVersion: 1, mode:'3D', templateId:'primitive_cube_v1', ...identity });
        const base = path.join(root,'mio-trusted-3d-v1');
        const folder = path.join(base,fs.readdirSync(base)[0]);
        const target = path.join(folder,fs.readdirSync(folder)[0]);
        const before = fs.readFileSync(target,'utf8');
        const tampered = JSON.parse(before);
        tampered.scene.objects[0].mesh.vertices[0].position[0] = 999;
        fs.writeFileSync(target,JSON.stringify(tampered));
        assert(!inspectTrustedCubeArtifact(root,identity).success,'tampered geometry accepted');
        fs.writeFileSync(target,before);
        const swapped = JSON.parse(before);
        swapped.assetId = 'scene_invalid';
        fs.writeFileSync(target,JSON.stringify(swapped));
        assert(!inspectTrustedCubeArtifact(root,identity).success,'tampered asset identity accepted');
      } finally { fs.rmSync(root,{recursive:true,force:true}); }
    }],
    ['oversized and symlinked files are rejected', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mio-inspect-'));
      try {
        const adapter = new TrustedCubeSceneAdapter(root, async () => true);
        await adapter.execute({ schemaVersion: 1, mode:'3D', templateId:'primitive_cube_v1', ...identity });
        const base = path.join(root,'mio-trusted-3d-v1');
        const folder = path.join(base,fs.readdirSync(base)[0]);
        const target = path.join(folder,fs.readdirSync(folder)[0]);
        fs.writeFileSync(target,'a'.repeat(140000));
        assert(!inspectTrustedCubeArtifact(root,identity).success,'oversized scene accepted');
        fs.unlinkSync(target);
        fs.symlinkSync(path.join(root,'missing'),target);
        assert(!inspectTrustedCubeArtifact(root,identity).success,'symlink followed');
      } finally {fs.rmSync(root,{recursive:true,force:true});}
    }],
    ['main-process inspection requires committed checkpoint and workspace scope', async () => {
      const handler = fs.readFileSync(path.resolve('electron/ipc/handlers.ts'),'utf8');
      const main = fs.readFileSync(path.resolve('electron/main.ts'),'utf8');
      const studio = fs.readFileSync(path.resolve('src/modes/studio3d/Studio3DView.tsx'),'utf8');
      const body = handler.slice(handler.indexOf('handleInspectTrustedCube:'),handler.indexOf('handleCreateTrustedCube:'));
      assert(body.includes("checkpoint.state !== 'COMMITTED'") && body.includes('isAuthorizedWorkspace(request.projectId)'), 'inspector missing trusted checks');
      assert(main.includes('secureHandle(IPC_CHANNELS.DESKTOP_INSPECT_TRUSTED_CUBE,'),'IPC not guarded');
      assert(studio.includes('inspected.verified') && studio.includes('setSceneData(previous =>'), 'Studio import lacks verified scene guard');
    }],
  ];
  let passed=0;for(const [name,fn] of checks){await fn();passed++;console.log('✓ [PASS] '+name);}return {passed,total:checks.length};
}
