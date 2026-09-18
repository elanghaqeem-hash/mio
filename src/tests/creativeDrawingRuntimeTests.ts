import type { DrawingLayer, MioDrawingDocument } from '../types/creative';
import { normalizeDrawingInput, type DrawingInputSample } from '../creative/drawing/DrawingInput';
import { DrawingStrokeSession } from '../creative/drawing/DrawingStrokeSession';
import { validateDrawingDocument, validateDrawingStroke } from '../creative/drawing/DrawingValidation';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => {
  try { await run(); return { name, passed: true }; }
  catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; }
};
const layer = (locked = false): DrawingLayer => ({ id: 'layer_test_001', name: 'Ink', visible: true, locked, opacity: 1, strokes: [] });
const sample = (overrides: Partial<DrawingInputSample> = {}): DrawingInputSample => ({
  x: 10, y: 12, pressure: 0.4, timestamp: 1000, pointerId: 7, pointerType: 'pen', ...overrides,
});
const style = { color: '#000000', size: 8, opacity: 1, blendMode: 'normal' as const };

export async function runCreativeDrawingRuntimeTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Drawing input normalizes pressure and rejects non-finite coordinates', () => {
    assert(normalizeDrawingInput(sample({ pressure: 2 })).pressure === 1, 'pressure above one was not clamped');
    assert(normalizeDrawingInput(sample({ pressure: -1 })).pressure === 0, 'pressure below zero was not clamped');
    assert(normalizeDrawingInput(sample({ pointerType: 'mouse', pressure: 0 })).pressure === 1, 'mouse fallback pressure was not applied');
    let rejected = false;
    try { normalizeDrawingInput(sample({ x: Number.NaN })); } catch { rejected = true; }
    assert(rejected, 'NaN coordinate was accepted');
  }));

  results.push(await test('Stroke session preserves pressure, filters duplicates, and keeps pressure-only changes', () => {
    const session = new DrawingStrokeSession('stroke_test_001', layer(), sample(), style);
    session.append(sample({ timestamp: 1001 }));
    session.append(sample({ pressure: 0.8, timestamp: 1002 }));
    session.append(sample({ x: 20, y: 24, pressure: 0.9, timestamp: 1003 }));
    const stroke = session.finalize();
    assert(stroke.points.length === 3, 'duplicate filtering or pressure-only retention is incorrect');
    assert(stroke.points[1].pressure === 0.8, 'pressure-only change was lost');
    assert(stroke.points[2].pressure === 0.9, 'final pressure was not preserved');
    assert(session.status === 'COMMITTED', 'session did not commit');
  }));

  results.push(await test('Single-point stroke remains a valid dot', () => {
    const stroke = new DrawingStrokeSession('stroke_dot', layer(), sample(), style).finalize();
    assert(stroke.points.length === 1, 'single-point stroke was not preserved');
    assert(validateDrawingStroke(stroke).valid, 'single-point stroke did not validate');
  }));

  results.push(await test('Locked layer and foreign pointer are rejected', () => {
    let lockedRejected = false;
    try { new DrawingStrokeSession('locked', layer(true), sample(), style); } catch { lockedRejected = true; }
    assert(lockedRejected, 'locked layer accepted a stroke');
    const session = new DrawingStrokeSession('owned', layer(), sample(), style);
    let pointerRejected = false;
    try { session.append(sample({ pointerId: 12, timestamp: 1001 })); } catch { pointerRejected = true; }
    assert(pointerRejected, 'foreign pointer entered active stroke');
  }));

  results.push(await test('Cancelled stroke cannot append or finalize', () => {
    const session = new DrawingStrokeSession('cancelled', layer(), sample(), style);
    session.cancel();
    let appendRejected = false, finalizeRejected = false;
    try { session.append(sample({ timestamp: 1001 })); } catch { appendRejected = true; }
    try { session.finalize(); } catch { finalizeRejected = true; }
    assert(appendRejected && finalizeRejected, 'cancelled session accepted further mutation');
  }));

  results.push(await test('Drawing document validation preserves existing schema and catches invalid committed pressure', () => {
    const document: MioDrawingDocument = { width: 800, height: 600, backgroundColor: '#ffffff', layers: [layer()] };
    assert(validateDrawingDocument(document).valid, 'existing drawing document schema became invalid');
    const invalid = { id: 'bad', color: '#000000', size: 8, opacity: 1, blendMode: 'normal' as const, points: [{ x: 1, y: 2, pressure: 1.5 }] };
    assert(validateDrawingStroke(invalid).errors.some(error => error.code === 'INVALID_PRESSURE'), 'invalid committed pressure was not detected');
  }));

  results.push(await test('Raw sample resource guard rejects runaway stroke input', () => {
    const session = new DrawingStrokeSession('bounded', layer(), sample(), style, { maxRawSamplesPerStroke: 2 });
    session.append(sample({ x: 11, timestamp: 1001 }));
    let rejected = false;
    try { session.append(sample({ x: 12, timestamp: 1002 })); } catch { rejected = true; }
    assert(rejected, 'raw sample limit was not enforced');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter(item => item.passed).length, total: results.length };
}
