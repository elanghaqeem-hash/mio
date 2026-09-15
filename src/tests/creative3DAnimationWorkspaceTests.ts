import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { CreativeDocumentRepository } from '../creative/CreativeDocumentRepository';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { Mio3DScene, MioAnimationProject } from '../types/creative';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => {
  try { await run(); return { name, passed: true }; }
  catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; }
};

const readLegacyState = <T>(kernel: CreativeDocumentKernel): T => kernel.snapshot().metadata.legacyData as T;

export async function runCreative3DAnimationWorkspaceTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('3D transforms, visibility and duplicated objects survive undo, redo and reopen', async () => {
    const fileName = 'VerticalSlice.mio3d';
    const initial: Mio3DScene = {
      objects: [{ id: 'mesh_a', name: 'Mesh A', type: 'cube', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#00f0ff', metalness: 0.5, roughness: 0.5, wireframe: false }],
      camera: { position: [0, 2, 5], fov: 50 },
      lights: { ambientColor: '#111111', ambientIntensity: 1, directionalColor: '#ffffff', directionalIntensity: 1 },
    };
    const id = createCreativeWorkspaceId(fileName);
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 100, id));
    const duplicate = { ...structuredClone(initial.objects[0]), id: 'mesh_a_copy', name: 'Mesh A Copy', position: [0.35, 0, 0.35] as [number, number, number] };
    const edited: Mio3DScene = {
      ...initial,
      objects: [{ ...initial.objects[0], position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: [2, 2, 2], visible: false }, duplicate],
    };

    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, edited) });
    assert(readLegacyState<Mio3DScene>(kernel).objects.length === 2, 'duplicate was not projected into the document');
    assert(readLegacyState<Mio3DScene>(kernel).objects[0].visible === false, 'visibility was not stored');
    kernel.undo();
    assert(readLegacyState<Mio3DScene>(kernel).objects.length === 1, 'undo did not remove the duplicate');
    kernel.redo();
    assert(readLegacyState<Mio3DScene>(kernel).objects[0].position[2] === 3, 'redo did not restore the transform');

    const repository = new CreativeDocumentRepository(new InMemoryStorageProvider());
    await repository.save(kernel.snapshot());
    const reopened = await repository.load(id);
    assert(Boolean(reopened), '3D document did not reopen');
    assert((reopened?.metadata.legacyData as Mio3DScene | undefined)?.objects[1]?.id === 'mesh_a_copy', 'reopen lost the duplicated object');
  }));

  results.push(await test('Animation keyframe snap, edit and delete state survives command history', () => {
    const fileName = 'VerticalSlice.mioanim';
    const initial: MioAnimationProject = {
      duration: 5,
      fps: 60,
      currentTime: 0,
      loop: true,
      tracks: [{ id: 'track_a', targetObjectId: 'mesh_a', property: 'position.y', keyframes: [{ time: 0, value: 0, interpolation: 'linear' }] }],
    };
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 200, createCreativeWorkspaceId(fileName)));
    const snappedTime = parseFloat((Math.round(1.237 * initial.fps) / initial.fps).toFixed(3));
    const withKeyframe: MioAnimationProject = {
      ...initial,
      tracks: [{ ...initial.tracks[0], keyframes: [...initial.tracks[0].keyframes, { time: snappedTime, value: 0.5, interpolation: 'easeInOut' }] }],
    };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, withKeyframe) });
    const edited: MioAnimationProject = {
      ...withKeyframe,
      tracks: [{ ...withKeyframe.tracks[0], keyframes: withKeyframe.tracks[0].keyframes.map((keyframe, index) => index === 1 ? { ...keyframe, value: 0.75, interpolation: 'step' } : keyframe) }],
    };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, edited) });
    assert(readLegacyState<MioAnimationProject>(kernel).tracks[0].keyframes[1].interpolation === 'step', 'keyframe interpolation edit was not stored');
    kernel.undo();
    assert(readLegacyState<MioAnimationProject>(kernel).tracks[0].keyframes[1].value === 0.5, 'undo did not restore the prior keyframe value');
    kernel.redo();
    const deleted: MioAnimationProject = { ...edited, tracks: [{ ...edited.tracks[0], keyframes: edited.tracks[0].keyframes.slice(0, 1) }] };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, deleted) });
    assert(readLegacyState<MioAnimationProject>(kernel).tracks[0].keyframes.length === 1, 'keyframe delete was not stored');
    kernel.undo();
    assert(readLegacyState<MioAnimationProject>(kernel).tracks[0].keyframes[1].time === snappedTime, 'undo did not restore the frame-snapped keyframe');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
