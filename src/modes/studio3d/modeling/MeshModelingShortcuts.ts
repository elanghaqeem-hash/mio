import type { MioMeshSelectionMode } from '../../../types/creative';

export type Mio3DWorkspaceMode = 'object' | 'edit';
export type Mio3DTransformMode = 'select' | 'move' | 'rotate' | 'scale';

export type MeshModelingShortcutAction =
  | { type: 'toggle-workspace' }
  | { type: 'selection-mode'; mode: MioMeshSelectionMode }
  | { type: 'transform-mode'; mode: Mio3DTransformMode };

export interface MeshModelingShortcutInput {
  key: string;
  workspaceMode: Mio3DWorkspaceMode;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export const resolveMeshModelingShortcut = (
  input: MeshModelingShortcutInput,
): MeshModelingShortcutAction | null => {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.key === 'Tab') return { type: 'toggle-workspace' };

  if (input.workspaceMode === 'edit') {
    if (input.key === '1') return { type: 'selection-mode', mode: 'vertex' };
    if (input.key === '2') return { type: 'selection-mode', mode: 'edge' };
    if (input.key === '3') return { type: 'selection-mode', mode: 'face' };
  }

  const key=input.key.toLowerCase();
  if (key === 'q') return { type: 'transform-mode', mode: 'select' };
  if (key === 'w') return { type: 'transform-mode', mode: 'move' };
  if (key === 'e') return { type: 'transform-mode', mode: 'rotate' };
  if (key === 'r') return { type: 'transform-mode', mode: 'scale' };
  return null;
};
