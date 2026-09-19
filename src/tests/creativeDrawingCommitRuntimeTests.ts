import { appendDrawingStroke, compileDrawingStrokeCommit } from '../creative/drawing/DrawingCommitAdapter';
import { DrawingRuntime } from '../creative/drawing/DrawingRuntime';
import { migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import type { MioDrawingDocument } from '../types/creative';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const drawing = (): MioDrawingDocument => ({ width: 800, height: 600, backgroundColor: '#ffffff', layers: [{ id: 'layer_1', name: 'Ink', visible: true, locked: false, opacity: 1, strokes: [] }] });
const stroke = { id: 'stroke_1', points: [{ x: 1, y: 2, pressure: 0.5 }], color: '#000000', size: 8, opacity: 1, blendMode: 'normal' as const };
const sample = { x: 1, y: 2, pressure: 0.5, timestamp: 1000, pointerId: 7, pointerType: 'pen' as const };
const style = { color: '#000000', size: 8, opacity: 1, blendMode: 'normal' as const };

export function runCreativeDrawingCommitRuntimeTests(): { passed: number; total: number } {
  const tests: Array<[string, () => void]> = [
    ['immutable append', () => { const before = drawing(); const after = appendDrawingStroke(before, 'layer_1', stroke); assert(before.layers[0].strokes.length === 0, 'source mutated'); assert(after.layers[0].strokes.length === 1, 'stroke missing'); }],
    ['atomic target validation', () => { const base = drawing(); const locked = structuredClone(base); locked.layers[0].locked = true; let failed = false; try { appendDrawingStroke(locked, 'layer_1', stroke); } catch { failed = true; } assert(failed, 'locked layer accepted'); let missing = false; try { appendDrawingStroke(base, 'missing', stroke); } catch { missing = true; } assert(missing, 'missing layer accepted'); const duplicate = appendDrawingStroke(base, 'layer_1', stroke); let duplicateFailed = false; try { appendDrawingStroke(duplicate, 'layer_1', stroke); } catch { duplicateFailed = true; } assert(duplicateFailed, 'duplicate accepted'); assert(base.layers[0].strokes.length === 0, 'failed validation mutated source'); }],
    ['one kernel transaction with undo and redo', () => { const state = drawing(); const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument('test.miodraw', state, 0, 'drawing_workspace')); const plan = compileDrawingStrokeCommit(kernel.snapshot(), 'test.miodraw', state, 'layer_1', stroke); const before = kernel.snapshot().revision; kernel.execute({ actor: 'user', command: plan.command }); assert(kernel.snapshot().revision === before + 1, 'not one revision'); assert((kernel.snapshot().metadata.legacyData as MioDrawingDocument).layers[0].strokes.length === 1, 'commit missing'); kernel.undo(); assert((kernel.snapshot().metadata.legacyData as MioDrawingDocument).layers[0].strokes.length === 0, 'undo failed'); kernel.redo(); assert((kernel.snapshot().metadata.legacyData as MioDrawingDocument).layers[0].strokes[0].id === stroke.id, 'redo failed'); }],
    ['transient runtime commits only at commit boundary', () => { const runtime = new DrawingRuntime(); const state = drawing(); runtime.beginStroke('runtime_stroke', state.layers[0], sample, style); runtime.appendSample({ ...sample, x: 5, timestamp: 1001 }); assert(runtime.hasActiveStroke(), 'session missing'); assert(state.layers[0].strokes.length === 0, 'transient leaked'); const result = runtime.commitStroke(migrateLegacyCreativeDocument('test.miodraw', state, 0, 'drawing_workspace'), 'test.miodraw', state, 'layer_1'); assert(result.nextState.layers[0].strokes.length === 1, 'commit plan missing'); assert(!runtime.hasActiveStroke(), 'session not released after successful plan'); }],
    ['failed commit preserves recovery session', () => { const runtime = new DrawingRuntime(); const state = drawing(); runtime.beginStroke('recovery_stroke', state.layers[0], sample, style); let failed = false; try { runtime.commitStroke(migrateLegacyCreativeDocument('test.miodraw', state, 0, 'drawing_workspace'), 'test.miodraw', state, 'missing'); } catch { failed = true; } assert(failed, 'invalid commit was accepted'); assert(runtime.hasActiveStroke(), 'failed commit lost recovery session'); assert(state.layers[0].strokes.length === 0, 'failed commit mutated canonical state'); runtime.cancelStroke(); }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
