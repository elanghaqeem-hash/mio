import React from 'react';
import { Check, Redo2, Save, Undo2 } from 'lucide-react';
import type { CreativeStudioWorkspace } from '../../creative/useCreativeStudioDocument';

interface Props {
  workspace: Pick<CreativeStudioWorkspace<unknown>, 'document' | 'status' | 'error' | 'canUndo' | 'canRedo' | 'undo' | 'redo' | 'save'>;
}

export const CreativeWorkspaceToolbar: React.FC<Props> = ({ workspace }) => (
  <div className="absolute left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-cyan-500/30 bg-[#080d16]/95 px-2 py-1 font-mono text-[10px] shadow-lg shadow-black/30 backdrop-blur">
    <span className="mr-1 max-w-32 truncate text-cyan-300" title={workspace.document.name}>{workspace.document.name}</span>
    <span className="mr-1 text-gray-500">R{workspace.document.revision}</span>
    <button disabled={!workspace.canUndo} onClick={workspace.undo} className="rounded p-1 text-gray-300 hover:bg-cyan-950 disabled:opacity-30" title="Undo"><Undo2 size={13} /></button>
    <button disabled={!workspace.canRedo} onClick={workspace.redo} className="rounded p-1 text-gray-300 hover:bg-cyan-950 disabled:opacity-30" title="Redo"><Redo2 size={13} /></button>
    <button onClick={() => void workspace.save()} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black hover:bg-cyan-400" title="Save creative document"><Save size={12} />SAVE</button>
    <span className={workspace.status === 'ERROR' ? 'text-red-400' : workspace.status === 'DIRTY' ? 'text-amber-300' : 'text-emerald-300'} title={workspace.error ?? workspace.status}>
      {workspace.status === 'SAVED' ? <Check size={12} /> : workspace.status}
    </span>
  </div>
);
