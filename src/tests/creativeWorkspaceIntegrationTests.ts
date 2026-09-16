import { CREATIVE_STUDIOS, adjacentCreativeStudio, createCreativeCopilotDraft, creativeStudioForDocumentKind, creativeStudioForMode, resolveCreativeShortcut } from '../creative/CreativeWorkspaceIntegration';

interface Result { name: string; passed: boolean; error?: string }
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
async function test(name: string, fn: () => void | Promise<void>): Promise<Result> { try { await fn(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }

export async function runCreativeWorkspaceIntegrationTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];

  results.push(await test('Creative studio registry covers all eight native workspaces', () => {
    assert(CREATIVE_STUDIOS.length === 8, 'expected eight creative studios');
    const modes = new Set(CREATIVE_STUDIOS.map((studio) => studio.mode));
    for (const mode of ['3D', 'ANIMATION', 'MOTION_2D', 'DRAWING', 'GRAPHIC', 'PHOTO', 'SFX', 'MUSIC']) assert(modes.has(mode as never), `missing ${mode}`);
  }));

  results.push(await test('Creative document kinds map to the correct workspace modes', () => {
    assert(creativeStudioForDocumentKind('3d')?.mode === '3D', '3d mapping incorrect');
    assert(creativeStudioForDocumentKind('motion-2d')?.mode === 'MOTION_2D', 'motion mapping incorrect');
    assert(creativeStudioForDocumentKind('drawing')?.mode === 'DRAWING', 'drawing mapping incorrect');
    assert(creativeStudioForDocumentKind('photo')?.mode === 'PHOTO', 'photo mapping incorrect');
    assert(creativeStudioForMode('MUSIC')?.kind === 'music', 'music mapping incorrect');
  }));

  results.push(await test('Studio cycling wraps in both directions', () => {
    assert(adjacentCreativeStudio('3D', -1) === 'MUSIC', 'previous wrap failed');
    assert(adjacentCreativeStudio('MUSIC', 1) === '3D', 'next wrap failed');
    assert(adjacentCreativeStudio('ANIMATION', 1) === 'MOTION_2D', 'forward order failed');
  }));

  results.push(await test('Shared creative shortcuts support save, undo, redo and studio cycling', () => {
    assert(resolveCreativeShortcut({ key: 's', ctrlKey: true }) === 'save', 'ctrl+s missing');
    assert(resolveCreativeShortcut({ key: 's', metaKey: true }) === 'save', 'cmd+s missing');
    assert(resolveCreativeShortcut({ key: 'z', ctrlKey: true }) === 'undo', 'ctrl+z missing');
    assert(resolveCreativeShortcut({ key: 'z', metaKey: true, shiftKey: true }) === 'redo', 'cmd+shift+z missing');
    assert(resolveCreativeShortcut({ key: 'y', ctrlKey: true }) === 'redo', 'ctrl+y missing');
    assert(resolveCreativeShortcut({ key: '[', altKey: true }) === 'previous-studio', 'previous studio shortcut missing');
    assert(resolveCreativeShortcut({ key: ']', altKey: true }) === 'next-studio', 'next studio shortcut missing');
  }));

  results.push(await test('Undo and studio shortcuts do not hijack text editing', () => {
    const input = { tagName: 'INPUT', type: 'text' };
    const textarea = { tagName: 'TEXTAREA' };
    assert(resolveCreativeShortcut({ key: 'z', ctrlKey: true, target: input }) === null, 'text input undo should remain native');
    assert(resolveCreativeShortcut({ key: ']', altKey: true, target: textarea }) === null, 'textarea studio cycle should remain native');
    assert(resolveCreativeShortcut({ key: 's', ctrlKey: true, target: input }) === 'save', 'global save should remain available');
  }));

  results.push(await test('Copilot handoff is proposal-first and includes document context', () => {
    const draft = createCreativeCopilotDraft('PHOTO', { name: 'Portrait_Edit', kind: 'photo', revision: 7, selection: { nodeIds: ['layer_1'], primaryNodeId: 'layer_1' } });
    assert(draft.includes('Photo Editing'), 'studio label missing');
    assert(draft.includes('Portrait_Edit'), 'document name missing');
    assert(draft.includes('revisi 7'), 'revision missing');
    assert(draft.includes('Jangan mengubah dokumen'), 'proposal-first boundary missing');
    assert(draft.includes('command/document kernel'), 'undoable command boundary missing');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}
