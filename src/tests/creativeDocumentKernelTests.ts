import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { createCreativeDocument, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeAutosaveController, CreativeDocumentRepository } from '../creative/CreativeDocumentRepository';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { CreativeNode } from '../types/creativeDocument';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => {
  try { await run(); return { name, passed: true }; }
  catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; }
};

const node = (id: string, name = id, parentId: string | null = null): CreativeNode => ({
  id,
  name,
  type: 'test-node',
  parentId,
  childIds: [],
  visible: true,
  locked: false,
  properties: {},
});

export async function runCreativeDocumentKernelTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Creative kernel executes serializable commands with undo and redo', () => {
    const kernel = new CreativeDocumentKernel(createCreativeDocument('drawing', 'Sketch', 100, 'doc_sketch'));
    kernel.execute({ timestamp: 101, command: { type: 'node.create', node: node('stroke_1') } });
    kernel.execute({ timestamp: 102, command: { type: 'node.update', nodeId: 'stroke_1', changes: { name: 'Ink stroke' } } });
    assert(kernel.snapshot().nodes.stroke_1.name === 'Ink stroke', 'node update was not applied');
    kernel.undo();
    assert(kernel.snapshot().nodes.stroke_1.name === 'stroke_1', 'undo did not restore node value');
    kernel.redo();
    const snapshot = kernel.snapshot();
    assert(snapshot.nodes.stroke_1.name === 'Ink stroke', 'redo did not replay node update');
    assert(snapshot.revision === 4 && snapshot.operations.length === 4, 'append-only operation history is incomplete');
    assert(JSON.parse(JSON.stringify(snapshot)).nodes.stroke_1.id === 'stroke_1', 'document is not JSON serializable');
  }));

  results.push(await test('Deleting and undoing a subtree preserves stable IDs and sibling order', () => {
    const kernel = new CreativeDocumentKernel(createCreativeDocument('3d', 'Scene', 200, 'doc_scene'));
    kernel.execute({ command: { type: 'node.create', node: node('root_a') } });
    kernel.execute({ command: { type: 'node.create', node: node('root_b') } });
    kernel.execute({ command: { type: 'node.create', node: node('child_a', 'Child A', 'root_a') } });
    kernel.execute({ command: { type: 'node.delete', nodeId: 'root_a' } });
    assert(!kernel.snapshot().nodes.child_a, 'subtree child survived deletion');
    kernel.undo();
    const restored = kernel.snapshot();
    assert(restored.rootNodeIds.join(',') === 'root_a,root_b', 'root ordering changed after undo');
    assert(restored.nodes.child_a.parentId === 'root_a' && restored.nodes.root_a.childIds[0] === 'child_a', 'subtree links were not restored');
  }));

  results.push(await test('Invalid batch fails atomically without partial mutation', () => {
    const kernel = new CreativeDocumentKernel(createCreativeDocument('graphic', 'Layout', 300, 'doc_layout'));
    let rejected = false;
    try {
      kernel.execute({ command: { type: 'batch', commands: [
        { type: 'node.create', node: node('valid_first') },
        { type: 'node.create', node: node('invalid_child', 'Invalid', 'missing_parent') },
      ] } });
    } catch { rejected = true; }
    assert(rejected, 'invalid batch should be rejected');
    assert(Object.keys(kernel.snapshot().nodes).length === 0 && kernel.snapshot().revision === 0, 'failed batch left partial state');
  }));

  results.push(await test('Legacy formats migrate through one normalized schema without changing IDs', () => {
    const fixtures = [
      ['model.mio3d', { objects: [{ id: 'mesh_legacy', name: 'Mesh' }] }],
      ['motion.mioanim', { duration: 3, fps: 30, tracks: [{ id: 'track_legacy', targetObjectId: 'mesh_legacy', property: 'position.y', keyframes: [] }] }],
      ['poster.mioart', { layers: [{ id: 'layer_legacy', name: 'Title' }] }],
      ['impact.miosfx', { layers: [{ id: 'sfx_legacy', name: 'Transient' }] }],
      ['score.miomusic', { tracks: [{ id: 'music_legacy', name: 'Lead' }] }],
    ] as const;
    const ids = fixtures.map(([fileName, data], index) => migrateLegacyCreativeDocument(fileName, data, 400 + index).rootNodeIds[0]);
    assert(ids.join(',') === 'mesh_legacy,track_legacy,layer_legacy,sfx_legacy,music_legacy', 'legacy identifiers were not preserved');
  }));

  results.push(await test('All legacy studio documents persist and reopen through the shared repository', async () => {
    const repository = new CreativeDocumentRepository(new InMemoryStorageProvider());
    const fixtures = [
      ['scene.mio3d', { objects: [{ id: 'mesh_1' }] }],
      ['clip.mioanim', { tracks: [{ id: 'anim_1' }] }],
      ['design.mioart', { layers: [{ id: 'layer_1' }] }],
      ['sound.miosfx', { layers: [{ id: 'sound_1' }] }],
      ['song.miomusic', { tracks: [{ id: 'track_1' }] }],
    ] as const;
    for (let index = 0; index < fixtures.length; index += 1) {
      const document = migrateLegacyCreativeDocument(fixtures[index][0], fixtures[index][1], 500 + index);
      await repository.save(document);
      const reopened = await repository.load(document.id);
      assert(reopened?.kind === document.kind && reopened.rootNodeIds[0] === document.rootNodeIds[0], `${document.kind} persistence round-trip failed`);
    }
    assert((await repository.listIds()).length === 5, 'creative document index is incomplete');
  }));

  results.push(await test('Autosave recovery is retained until an explicit durable save', async () => {
    const repository = new CreativeDocumentRepository(new InMemoryStorageProvider());
    const controller = new CreativeAutosaveController(repository, 0);
    const document = createCreativeDocument('photo', 'Portrait', 600, 'doc_photo');
    controller.schedule(document);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert((await repository.loadRecovery(document.id))?.document.kind === 'photo', 'recovery snapshot was not written');
    await controller.flush(document);
    assert(await repository.load(document.id), 'durable document save failed');
    assert((await repository.loadRecovery(document.id)) === null, 'recovery snapshot was not cleared after save');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
