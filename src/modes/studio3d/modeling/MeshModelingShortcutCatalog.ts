export interface MeshModelingShortcutHelpItem {
  keys: string;
  action: string;
  scope: 'Global' | 'Edit';
}

export interface MeshModelingShortcutHelpGroup {
  title: string;
  items: MeshModelingShortcutHelpItem[];
}

export const MESH_MODELING_SHORTCUT_GROUPS: MeshModelingShortcutHelpGroup[] = [
  {
    title: 'Workspace',
    items: [
      { keys: 'Tab', action: 'Toggle Object / Edit Mode', scope: 'Global' },
      { keys: '?', action: 'Open / close shortcut help', scope: 'Global' },
      { keys: 'Esc', action: 'Close shortcut help / cancel active transform preview', scope: 'Global' },
    ],
  },
  {
    title: 'Transform',
    items: [
      { keys: 'Q', action: 'Select', scope: 'Global' },
      { keys: 'W', action: 'Move', scope: 'Global' },
      { keys: 'E', action: 'Rotate', scope: 'Global' },
      { keys: 'R', action: 'Scale', scope: 'Global' },
    ],
  },
  {
    title: 'Components',
    items: [
      { keys: '1', action: 'Vertex selection mode', scope: 'Edit' },
      { keys: '2', action: 'Edge selection mode', scope: 'Edit' },
      { keys: '3', action: 'Face selection mode', scope: 'Edit' },
    ],
  },
  {
    title: 'Object Actions',
    items: [
      { keys: 'Ctrl/Cmd + D', action: 'Duplicate selected object', scope: 'Global' },
      { keys: 'Delete', action: 'Delete selected object', scope: 'Global' },
    ],
  },
];
