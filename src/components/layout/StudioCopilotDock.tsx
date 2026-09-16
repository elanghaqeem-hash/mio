import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';
import { eventBus } from '../../core/EventBus';
import { createCreativeCopilotDraft, isCreativeStudioMode } from '../../creative/CreativeWorkspaceIntegration';
import { MioCoreState, MioSystemMode } from '../../types/core';

interface StudioCopilotDockProps {
  state: MioCoreState;
  mode: MioSystemMode;
  onOpenCore: () => void;
}

export const StudioCopilotDock: React.FC<StudioCopilotDockProps> = ({ state, mode, onOpenCore }) => {
  const openCore = () => {
    if (isCreativeStudioMode(mode)) eventBus.emit('CHAT_DRAFT', createCreativeCopilotDraft(mode));
    onOpenCore();
  };

  return (
    <button type="button" onClick={openCore} className="studio-copilot-dock group" aria-label={`Open Mio Core from ${mode}${isCreativeStudioMode(mode) ? ' with a proposal-first creative draft' : ''}`}>
      <MioCoreVisualizer state={state} size={52} interactive={false} priority="compact" />
      <span className="min-w-0 text-left">
        <span className="flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.16em] text-cyan-300"><Sparkles size={10} /> MIO COPILOT</span>
        <span className="block truncate text-xs text-slate-300">{isCreativeStudioMode(mode) ? `${mode} · proposal first` : `${mode} workspace active`}</span>
      </span>
      <ChevronRight size={15} className="ml-auto text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
    </button>
  );
};
