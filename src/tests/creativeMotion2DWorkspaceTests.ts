import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from '../creative/CreativeDocumentFactory';
import { CreativeDocumentKernel } from '../creative/CreativeDocumentKernel';
import { evaluateMotionKeyframes, snapMotionTime } from '../creative/MotionWorkspace';
import { createStudioStateCommand } from '../creative/useCreativeStudioDocument';
import type { MioMotionProject } from '../types/creative';

interface Result { name: string; passed: boolean; error?: string }
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const test = async (name: string, run: () => void | Promise<void>): Promise<Result> => { try { await run(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } };

const fixture = (): MioMotionProject => ({
  width: 1920, height: 1080, backgroundColor: '#000000', duration: 5, fps: 30, currentTime: 0, loop: true,
  layers: [{ id: 'title', name: 'Title', type: 'text', visible: true, locked: false, x: 100, y: 200, width: 400, height: 80, scale: 1, rotation: 0, opacity: 1, fill: '#ffffff', text: 'Mio' }],
  tracks: [{ id: 'title_x', nodeId: 'title', property: 'x', keyframes: [{ id: 'a', time: 0, value: 100, interpolation: 'linear' }, { id: 'b', time: 2, value: 500, interpolation: 'linear' }] }],
});

export async function runCreativeMotion2DWorkspaceTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];
  results.push(await test('Motion evaluator interpolates deterministically and snaps to project FPS', () => {
    const project = fixture();
    assert(evaluateMotionKeyframes(project.tracks[0].keyframes, 1, 0) === 300, 'linear midpoint evaluation is incorrect');
    assert(snapMotionTime(1.237, 30) === 1.233, '30 FPS snapping is incorrect');
    assert(evaluateMotionKeyframes([{ id: 's0', time: 0, value: 1, interpolation: 'step' }, { id: 's1', time: 2, value: 5, interpolation: 'linear' }], 1, 0) === 1, 'step interpolation changed before the next key');
  }));
  results.push(await test('Motion layers and tracks share normalized document history and timeline', () => {
    const fileName = 'Sequence.miomotion'; const initial = fixture();
    const kernel = new CreativeDocumentKernel(migrateLegacyCreativeDocument(fileName, initial, 10, createCreativeWorkspaceId(fileName)));
    assert(kernel.snapshot().kind === 'motion-2d' && kernel.snapshot().timeline?.tracks.length === 1, 'motion migration did not project timeline tracks');
    const edited: MioMotionProject = { ...initial, tracks: [...initial.tracks, { id: 'title_opacity', nodeId: 'title', property: 'opacity', keyframes: [{ id: 'o0', time: 0, value: 0, interpolation: 'easeIn' }, { id: 'o1', time: 1, value: 1, interpolation: 'linear' }] }] };
    kernel.execute({ actor: 'user', command: createStudioStateCommand(kernel.snapshot(), fileName, edited) });
    assert(kernel.snapshot().timeline?.tracks.length === 2, 'new motion track was not projected to shared timeline');
    assert(Boolean(kernel.snapshot().nodes.title), 'motion layer was not normalized');
    kernel.undo(); assert(kernel.snapshot().timeline?.tracks.length === 1, 'undo did not restore the previous motion timeline');
    kernel.redo(); assert(kernel.snapshot().timeline?.tracks[1].property === 'opacity', 'redo did not restore motion track');
  }));
  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
