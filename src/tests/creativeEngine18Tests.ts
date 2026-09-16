import { CreativeOrchestrator } from '../agents/CreativeOrchestrator';
import { createCreativeProjectSnapshotInput, creativeDocumentKindForAssetType, isAssetCompatibleWithDocument, sortCreativeAssetsNewestFirst } from '../creative/CreativeProjectAssets';
import { ProjectManager } from '../project/ProjectManager';
import { ResultValidator } from '../security/ResultValidator';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { MioDrawingDocument, MioMotionProject, MioPhotoDocument } from '../types/creative';
import type { CreativeDocumentKind } from '../types/creativeDocument';

interface Result { name: string; passed: boolean; error?: string }
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
async function test(name: string, fn: () => void | Promise<void>): Promise<Result> { try { await fn(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }

export async function runCreativeEngine18Tests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Creative project asset mapping covers all eight document kinds', () => {
    const kinds: CreativeDocumentKind[] = ['3d', 'animation', 'motion-2d', 'drawing', 'graphic', 'photo', 'sfx', 'music'];
    for (const kind of kinds) assert(creativeDocumentKindForAssetType(kind) === kind, `asset mapping missing ${kind}`);
  }));

  results.push(await test('Creative snapshot metadata is deterministic and state is cloned', () => {
    const state = { layers: [{ id: 'layer_1', value: 1 }] };
    const snapshot = createCreativeProjectSnapshotInput({ name: 'Poster', kind: 'graphic', revision: 4 }, state, Date.UTC(2026, 8, 16, 2, 0, 0));
    assert(snapshot.type === 'graphic', 'snapshot type mismatch');
    assert(snapshot.name.includes('Poster · R4'), 'revision missing from snapshot name');
    assert(snapshot.filePath.includes('CREATIVE/graphic/Poster-r4-'), 'snapshot path mismatch');
    state.layers[0].value = 99;
    assert((snapshot.data as typeof state).layers[0].value === 1, 'snapshot must clone editor state');
  }));

  results.push(await test('Creative asset filtering sorts newest snapshots and checks compatibility', () => {
    const assets = [
      { id: 'a', name: 'Old', type: 'drawing', origin: 'USER-EDITED', version: 1, createdAt: 1, updatedAt: 2, filePath: 'a', data: {}, verified: true },
      { id: 'b', name: 'Doc', type: 'document', origin: 'IMPORTED', version: 1, createdAt: 3, updatedAt: 4, filePath: 'b', data: {}, verified: true },
      { id: 'c', name: 'New', type: 'photo', origin: 'USER-EDITED', version: 1, createdAt: 5, updatedAt: 6, filePath: 'c', data: {}, verified: true },
    ] as any[];
    const creative = sortCreativeAssetsNewestFirst(assets);
    assert(creative.length === 2 && creative[0].id === 'c' && creative[1].id === 'a', 'creative sort/filter failed');
    assert(isAssetCompatibleWithDocument(creative[0], 'photo'), 'photo compatibility failed');
    assert(!isAssetCompatibleWithDocument(creative[0], 'drawing'), 'cross-kind load should be incompatible');
  }));

  results.push(await test('Drawing, photo and motion validators accept valid native documents', () => {
    const drawing: MioDrawingDocument = { width: 800, height: 800, backgroundColor: '#000', layers: [{ id: 'l1', name: 'Ink', visible: true, locked: false, opacity: 1, strokes: [{ id: 's1', color: '#fff', size: 4, opacity: 1, blendMode: 'normal', points: [{ x: 0, y: 0, pressure: .5 }, { x: 10, y: 10, pressure: 1 }] }] }] };
    const photo: MioPhotoDocument = { width: 800, height: 600, backgroundColor: '#000', layers: [{ id: 'p1', name: 'Source', visible: true, locked: false, opacity: 1, sourceDataUrl: 'data:image/svg+xml,<svg/>', adjustments: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, grayscale: 0, sepia: 0, blur: 0, vignette: 0 } }] };
    const motion: MioMotionProject = { width: 1920, height: 1080, backgroundColor: '#000', duration: 4, fps: 30, currentTime: 0, loop: true, layers: [{ id: 'm1', name: 'Title', type: 'text', visible: true, locked: false, x: 0, y: 0, width: 400, height: 100, scale: 1, rotation: 0, opacity: 1, fill: '#fff', text: 'Mio' }], tracks: [{ id: 't1', nodeId: 'm1', property: 'x', keyframes: [{ id: 'k1', time: 0, value: 0, interpolation: 'linear' }, { id: 'k2', time: 4, value: 100, interpolation: 'easeOut' }] }] };
    assert(ResultValidator.validateDrawing(drawing).valid, 'drawing should validate');
    assert(ResultValidator.validatePhoto(photo).valid, 'photo should validate');
    assert(ResultValidator.validateMotion2D(motion).valid, 'motion should validate');
  }));

  const storage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(storage);
  await ProjectManager.initialize();
  ProjectManager.createProject('Creative Engine 1.8 Test');

  results.push(await test('Project manager persists drawing, photo and motion asset types', async () => {
    for (const type of ['drawing', 'photo', 'motion-2d'] as const) ProjectManager.addAsset({ name: type, type, origin: 'USER-EDITED', filePath: `CREATIVE/${type}`, data: { type }, verified: true });
    await ProjectManager.flush();
    ProjectManager.setStorageProvider(storage);
    await ProjectManager.initialize();
    const types = new Set(ProjectManager.getProject().assets.map((asset) => asset.type));
    assert(types.has('drawing') && types.has('photo') && types.has('motion-2d'), 'new creative asset types did not survive persistence');
  }));

  results.push(await test('Eight-studio planner recognizes drawing photo and motion graphics separately', () => {
    const steps = CreativeOrchestrator.planCreativePipeline('Draw a concept illustration, retouch a photo, create a graphic title and turn it into 2D motion graphics');
    const modes = new Set(steps.map((step) => step.mode));
    assert(modes.has('DRAWING'), 'drawing step missing');
    assert(modes.has('PHOTO'), 'photo step missing');
    assert(modes.has('GRAPHIC'), 'graphic step missing');
    assert(modes.has('MOTION_2D'), 'motion 2D step missing');
    assert(!modes.has('ANIMATION'), 'motion graphics should not be misrouted to 3D animation');
    const motion = steps.find((step) => step.mode === 'MOTION_2D');
    assert((motion?.dependsOnStepIds.length ?? 0) >= 1, 'motion composition should depend on visual source steps');
  }));

  results.push(await test('Drawing photo graphic and motion pipeline executes with validated project assets', async () => {
    ProjectManager.createProject('Creative Engine 1.8 Pipeline');
    const prompt = 'Draw a concept illustration, retouch a photo, design a graphic title and create 2D motion graphics';
    const steps = CreativeOrchestrator.planCreativePipeline(prompt);
    const success = await CreativeOrchestrator.executePipeline(steps, () => undefined, prompt);
    assert(success, 'expanded creative pipeline should succeed');
    assert(steps.every((step) => step.status === 'completed' && step.validation?.valid), 'all expanded pipeline steps should validate');
    const types = new Set(ProjectManager.getProject().assets.map((asset) => asset.type));
    assert(types.has('drawing') && types.has('photo') && types.has('graphic') && types.has('motion-2d'), 'expanded pipeline assets missing');
    const motionStep = ProjectManager.getProject().creativePipelines?.[0]?.steps.find((step) => step.mode === 'MOTION_2D');
    assert((motionStep?.dependsOnAssetIds.length ?? 0) >= 1, 'motion output should retain upstream asset lineage');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
