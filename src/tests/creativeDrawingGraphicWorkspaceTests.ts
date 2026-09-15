import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import type { MioDrawingDocument, MioGraphicDocument } from '../types/creative';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => {
  try { await run(); return { name, passed: true }; }
  catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; }
};
const readState = <T>(kernel: CreativeDocumentKernel): T => kernel.snapshot().metadata.legacyData as T;

export async function runCreativeDrawingGraphicWorkspaceTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Drawing layers and pressure-aware strokes use the shared history boundary', () => {
    const fileName = 'Sketch.miodraw';
    const initial: MioDrawingDocument = { width: 800, height: 600, backgroundColor: '#ffffff', layers: [{ id: 'ink', name: 'Ink', visible: true, locked: false, opacity: 1, strokes: [] }] };
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 1, createCreativeWorkspaceId(fileName)));
    const drawn: MioDrawingDocument = { ...initial, layers: [{ ...initial.layers[0], strokes: [{ id: 'stroke_1', color: '#000000', size: 8, opacity: 1, blendMode: 'normal', points: [{ x: 10, y: 12, pressure: 0.4 }, { x: 20, y: 24, pressure: 0.8 }] }] }] };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, drawn) });
    assert(readState<MioDrawingDocument>(kernel).layers[0].strokes[0].points[1].pressure === 0.8, 'stroke pressure data was not stored');
    assert(Boolean(kernel.snapshot().nodes.ink), 'drawing layer was not normalized into a document node');
    kernel.undo();
    assert(readState<MioDrawingDocument>(kernel).layers[0].strokes.length === 0, 'undo did not remove the stroke');
    kernel.redo();
    assert(readState<MioDrawingDocument>(kernel).layers[0].strokes.length === 1, 'redo did not restore the stroke');
  }));

  results.push(await test('Graphic layer duplication and z-order remain serializable and undoable', () => {
    const fileName = 'Layout.mioart';
    const baseLayer = { id: 'shape_a', name: 'Shape A', type: 'shape' as const, shapeType: 'rectangle' as const, visible: true, locked: false, opacity: 1, x: 10, y: 10, width: 100, height: 100, fill: '#00ffff' };
    const initial: MioGraphicDocument = { width: 600, height: 600, backgroundColor: '#000000', layers: [baseLayer] };
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 2, createCreativeWorkspaceId(fileName)));
    const duplicate = { ...baseLayer, id: 'shape_a_copy', name: 'Shape A Copy', x: 26, y: 26 };
    const edited: MioGraphicDocument = { ...initial, layers: [duplicate, baseLayer] };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, edited) });
    assert(readState<MioGraphicDocument>(kernel).layers[0].id === 'shape_a_copy', 'graphic z-order was not preserved');
    assert(Boolean(kernel.snapshot().nodes.shape_a_copy), 'duplicated layer was not normalized');
    kernel.undo();
    assert(readState<MioGraphicDocument>(kernel).layers.length === 1, 'undo did not remove duplicated layer');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
