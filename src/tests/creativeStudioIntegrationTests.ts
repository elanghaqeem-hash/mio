import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { CreativeDocumentRepository } from '../creative/CreativeDocumentRepository';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => {
  try { await run(); return { name, passed: true }; }
  catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; }
};

export async function runCreativeStudioIntegrationTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Five existing studios edit, undo, redo, save and reopen through the shared kernel', async () => {
    const repository = new CreativeDocumentRepository(new InMemoryStorageProvider());
    const fixtures: Array<{ fileName: string; collection: string; initial: Record<string, unknown> }> = [
      { fileName: 'Workspace.mio3d', collection: 'objects', initial: { objects: [{ id: 'mesh_existing', name: 'Existing mesh' }] } },
      { fileName: 'Workspace.mioanim', collection: 'tracks', initial: { duration: 5, fps: 60, currentTime: 0, loop: true, tracks: [{ id: 'anim_existing', targetObjectId: 'mesh_existing', keyframes: [] }] } },
      { fileName: 'Workspace.mioart', collection: 'layers', initial: { width: 600, height: 700, layers: [{ id: 'graphic_existing', name: 'Existing layer' }] } },
      { fileName: 'Workspace.miosfx', collection: 'layers', initial: { name: 'Impact', layers: [{ id: 'sfx_existing', name: 'Existing layer' }] } },
      { fileName: 'Workspace.miomusic', collection: 'tracks', initial: { tempo: 120, tracks: [{ id: 'music_existing', name: 'Existing track' }] } },
    ];

    for (const fixture of fixtures) {
      const id = createCreativeWorkspaceId(fixture.fileName);
      const document = migrateLegacyCreativeDocument(fixture.fileName, fixture.initial, 100, id);
      const kernel = new CreativeDocumentKernel(document);
      const next = structuredClone(fixture.initial);
      const collection = next[fixture.collection] as Array<Record<string, unknown>>;
      const addedId = `${document.kind}_added`;
      collection.push({ id: addedId, name: 'Added through command bus' });

      kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fixture.fileName, next) });
      assert(Boolean(kernel.snapshot().nodes[addedId]), `${document.kind} normalized node was not updated`);
      kernel.undo();
      assert(!kernel.snapshot().nodes[addedId], `${document.kind} undo did not restore prior studio state`);
      kernel.redo();
      assert(Boolean(kernel.snapshot().nodes[addedId]), `${document.kind} redo did not replay studio edit`);

      await repository.save(kernel.snapshot());
      const reopened = await repository.load(id);
      assert(Boolean(reopened?.nodes[addedId]), `${document.kind} did not reopen with the edited state`);
    }
    assert((await repository.listIds()).length === 5, 'shared repository did not index all five studios');
  }));

  results.push(await test('Workspace IDs remain stable across sessions and formats', () => {
    const first = createCreativeWorkspaceId('MIO_Local_Scene.mio3d');
    const second = createCreativeWorkspaceId('MIO_Local_Scene.mio3d');
    const other = createCreativeWorkspaceId('MIO_Graphic.mioart');
    assert(first === second, 'same creative workspace did not receive a stable ID');
    assert(first !== other, 'different creative workspaces must not share an ID');
  }));

  results.push(await test('New studio extensions enter the same normalized document boundary', () => {
    const motion = migrateLegacyCreativeDocument('Sequence.miomotion', { layers: [] }, 200, createCreativeWorkspaceId('Sequence.miomotion'));
    const drawing = migrateLegacyCreativeDocument('Sketch.miodraw', { layers: [] }, 201, createCreativeWorkspaceId('Sketch.miodraw'));
    const photo = migrateLegacyCreativeDocument('Develop.miophoto', { layers: [] }, 202, createCreativeWorkspaceId('Develop.miophoto'));
    assert(motion.kind === 'motion-2d' && drawing.kind === 'drawing' && photo.kind === 'photo', 'new studio extension mapping is incomplete');
  }));

  results.push(await test('Legacy studio projection preserves kernel-native root nodes', () => {
    const fileName = 'Hybrid.mioart';
    const initial = { width: 100, height: 100, layers: [{ id: 'legacy_layer', name: 'Legacy' }] };
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 300, createCreativeWorkspaceId(fileName)));
    kernel.execute({ command: { type: 'node.create', node: { id: 'native_annotation', type: 'annotation', name: 'Native', parentId: null, childIds: [], visible: true, locked: false, properties: { source: 'kernel' } } } });
    const edited = { ...initial, layers: [{ id: 'legacy_layer_2', name: 'Edited legacy layer' }] };
    kernel.execute({ command: createStudioStateCommand(kernel.snapshot(), fileName, edited) });
    assert(Boolean(kernel.snapshot().nodes.native_annotation), 'studio projection removed a kernel-native root node');
    assert(Boolean(kernel.snapshot().nodes.legacy_layer_2) && !kernel.snapshot().nodes.legacy_layer, 'managed legacy nodes were not replaced');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
