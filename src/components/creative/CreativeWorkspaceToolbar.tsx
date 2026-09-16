import React, { useEffect } from 'react';
import { Check, Redo2, Save, Sparkles, Undo2 } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { CREATIVE_STUDIOS, adjacentCreativeStudio, createCreativeCopilotDraft, creativeStudioForDocumentKind, resolveCreativeShortcut, type CreativeStudioMode } from '../../creative/CreativeWorkspaceIntegration';
import type { CreativeStudioWorkspace } from '../../creative/useCreativeStudioDocument';
import { CreativeAssetLibrary } from './CreativeAssetLibrary';

interface Props<T> {
  workspace: Pick<CreativeStudioWorkspace<T>, 'document' | 'state' | 'setState' | 'status' | 'error' | 'canUndo' | 'canRedo' | 'undo' | 'redo' | 'save'>;
}

export const CreativeWorkspaceToolbar = <T,>({ workspace }: Props<T>) => {
  const currentStudio = creativeStudioForDocumentKind(workspace.document.kind);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveCreativeShortcut(event);
      if (!action) return;

      if (action === 'undo' && !workspace.canUndo) return;
      if (action === 'redo' && !workspace.canRedo) return;
      event.preventDefault();

      if (action === 'save') void workspace.save();
      else if (action === 'undo') workspace.undo();
      else if (action === 'redo') workspace.redo();
      else if (currentStudio) eventBus.emit('SWITCH_MODE', adjacentCreativeStudio(currentStudio.mode, action === 'previous-studio' ? -1 : 1));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStudio, workspace]);

  const switchStudio = (mode: CreativeStudioMode) => eventBus.emit('SWITCH_MODE', mode);
  const openCopilot = () => {
    eventBus.emit('CHAT_DRAFT', createCreativeCopilotDraft(currentStudio?.mode ?? 'GRAPHIC', workspace.document));
    eventBus.emit('SWITCH_MODE', 'CHAT');
  };

  return (
    <div className="absolute left-1/2 top-2 z-50 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-lg border border-cyan-500/30 bg-[#080d16]/95 px-2 py-1 font-mono text-[10px] shadow-lg shadow-black/30 backdrop-blur" role="toolbar" aria-label="Creative document controls">
      <select
        aria-label="Switch creative studio"
        value={currentStudio?.mode ?? 'GRAPHIC'}
        onChange={(event) => switchStudio(event.target.value as CreativeStudioMode)}
        className="max-w-24 rounded border border-gray-700 bg-[#0d121d] px-1.5 py-1 text-[10px] text-cyan-200 outline-none focus-visible:border-cyan-400 sm:max-w-32"
        title="Switch studio · Alt+[ / Alt+]"
      >
        {CREATIVE_STUDIOS.map((studio) => <option key={studio.mode} value={studio.mode}>{studio.shortLabel}</option>)}
      </select>
      <span className="mr-1 hidden max-w-32 truncate text-cyan-300 sm:inline" title={workspace.document.name}>{workspace.document.name}</span>
      <span className="mr-1 text-gray-500" aria-label={`Revision ${workspace.document.revision}`}>R{workspace.document.revision}</span>
      <button disabled={!workspace.canUndo} onClick={workspace.undo} className="rounded p-1 text-gray-300 outline-none hover:bg-cyan-950 focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-30" title="Undo · Ctrl/Cmd+Z" aria-label="Undo creative edit"><Undo2 size={13} /></button>
      <button disabled={!workspace.canRedo} onClick={workspace.redo} className="rounded p-1 text-gray-300 outline-none hover:bg-cyan-950 focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:opacity-30" title="Redo · Ctrl/Cmd+Shift+Z or Ctrl+Y" aria-label="Redo creative edit"><Redo2 size={13} /></button>
      <button onClick={() => void workspace.save()} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black outline-none hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-200" title="Save · Ctrl/Cmd+S" aria-label="Save creative document"><Save size={12} /><span className="hidden sm:inline">SAVE</span></button>
      <CreativeAssetLibrary workspace={workspace} />
      <button onClick={openCopilot} className="flex items-center gap-1 rounded border border-violet-500/40 bg-violet-950/30 px-2 py-1 font-bold text-violet-200 outline-none hover:bg-violet-900/50 focus-visible:ring-1 focus-visible:ring-violet-300" title="Ask Mio Copilot · proposal first" aria-label="Open Mio Creative Copilot with current document context"><Sparkles size={12} /><span className="hidden md:inline">COPILOT</span></button>
      <span className={workspace.status === 'ERROR' ? 'text-red-400' : workspace.status === 'DIRTY' ? 'text-amber-300' : 'text-emerald-300'} title={workspace.error ?? workspace.status} aria-live="polite">
        {workspace.status === 'SAVED' ? <Check size={12} aria-label="Saved" /> : workspace.status}
      </span>
    </div>
  );
};
