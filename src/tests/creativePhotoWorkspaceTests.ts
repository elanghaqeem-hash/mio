import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { CreativeDocumentRepository } from '../creative/CreativeDocumentRepository';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { MioPhotoDocument, PhotoAdjustments } from '../types/creative';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => { try { await run(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } };
const neutral: PhotoAdjustments = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, grayscale: 0, sepia: 0, blur: 0, vignette: 0 };
const read = (kernel: CreativeDocumentKernel): MioPhotoDocument => kernel.snapshot().metadata.legacyData as MioPhotoDocument;

export async function runCreativePhotoWorkspaceTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];
  results.push(await test('Photo adjustments remain nondestructive, undoable and durable', async () => {
    const fileName = 'Develop.miophoto';
    const initial: MioPhotoDocument = { width: 1200, height: 800, backgroundColor: '#111111', layers: [{ id: 'photo_a', name: 'Portrait', visible: true, locked: false, opacity: 1, sourceDataUrl: 'data:image/png;base64,fixture', adjustments: neutral }] };
    const id = createCreativeWorkspaceId(fileName);
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 10, id));
    const developed: MioPhotoDocument = { ...initial, layers: [{ ...initial.layers[0], adjustments: { ...neutral, exposure: 0.7, contrast: 18, temperature: 12, vignette: 20 } }] };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, developed) });
    assert(read(kernel).layers[0].sourceDataUrl === initial.layers[0].sourceDataUrl, 'develop adjustments modified the source image');
    assert(read(kernel).layers[0].adjustments.exposure === 0.7, 'exposure was not stored');
    kernel.undo();
    assert(read(kernel).layers[0].adjustments.exposure === 0, 'undo did not restore neutral adjustments');
    kernel.redo();
    const repository = new CreativeDocumentRepository(new InMemoryStorageProvider());
    await repository.save(kernel.snapshot());
    const reopened = await repository.load(id);
    assert((reopened?.metadata.legacyData as MioPhotoDocument | undefined)?.layers[0].adjustments.vignette === 20, 'reopen lost photo adjustments');
  }));
  results.push(await test('Photo layer visibility and lock state project into normalized nodes', () => {
    const fileName = 'Layers.miophoto';
    const photo: MioPhotoDocument = { width: 100, height: 100, backgroundColor: '#000000', layers: [{ id: 'photo_locked', name: 'Locked', visible: false, locked: true, opacity: .5, adjustments: neutral }] };
    const document = migrateLegacyCreativeDocument(fileName, photo, 11, createCreativeWorkspaceId(fileName));
    assert(document.nodes.photo_locked.visible === false && document.nodes.photo_locked.locked === true, 'photo layer flags were not normalized');
  }));
  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
