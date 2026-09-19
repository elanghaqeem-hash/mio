import { appendDrawingStroke } from '../creative/drawing/DrawingCommitAdapter';
import type { MioDrawingDocument } from '../types/creative';
const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const makeDocument = (): MioDrawingDocument => ({ width: 800, height: 600, backgroundColor: '#ffffff', layers: [{ id: 'layer_1', name: 'Ink', visible: true, locked: false, opacity: 1, strokes: [] }] });
const makeStroke = () => ({ id: 'stroke_1', points: [{ x: 1, y: 2, pressure: 0.5 }], color: '#000000', size: 8, opacity: 1, blendMode: 'normal' as const });
export function runCreativeDrawingCommitRuntimeTests(): { passed: number; total: number } { const before = makeDocument(); const after = appendDrawingStroke(before, 'layer_1', makeStroke()); assert(before.layers[0].strokes.length === 0, 'source mutated'); assert(after.layers[0].strokes.length === 1, 'stroke missing'); let rejected = false; try { appendDrawingStroke(after, 'layer_1', makeStroke()); } catch { rejected = true; } assert(rejected, 'duplicate accepted'); return { passed: 2, total: 2 }; }
