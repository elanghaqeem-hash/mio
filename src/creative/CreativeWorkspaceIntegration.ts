import type { MioSystemMode } from '../types/core';
import type { CreativeDocument, CreativeDocumentKind } from '../types/creativeDocument';

export type CreativeStudioMode = Extract<MioSystemMode, '3D' | 'ANIMATION' | 'GRAPHIC' | 'DRAWING' | 'PHOTO' | 'MOTION_2D' | 'SFX' | 'MUSIC'>;
export type CreativeShortcutAction = 'save' | 'undo' | 'redo' | 'previous-studio' | 'next-studio' | null;

export interface CreativeStudioDescriptor {
  mode: CreativeStudioMode;
  kind: CreativeDocumentKind;
  label: string;
  shortLabel: string;
}

export const CREATIVE_STUDIOS: readonly CreativeStudioDescriptor[] = [
  { mode: '3D', kind: '3d', label: '3D Modelling', shortLabel: '3D' },
  { mode: 'ANIMATION', kind: 'animation', label: '3D Animation', shortLabel: 'Anim' },
  { mode: 'MOTION_2D', kind: 'motion-2d', label: '2D / Motion', shortLabel: 'Motion' },
  { mode: 'DRAWING', kind: 'drawing', label: 'Drawing', shortLabel: 'Draw' },
  { mode: 'GRAPHIC', kind: 'graphic', label: 'Graphic Design', shortLabel: 'Design' },
  { mode: 'PHOTO', kind: 'photo', label: 'Photo Editing', shortLabel: 'Photo' },
  { mode: 'SFX', kind: 'sfx', label: 'SFX Studio', shortLabel: 'SFX' },
  { mode: 'MUSIC', kind: 'music', label: 'Music Studio', shortLabel: 'Music' },
] as const;

const studioByMode = new Map<CreativeStudioMode, CreativeStudioDescriptor>(CREATIVE_STUDIOS.map((studio) => [studio.mode, studio]));
const studioByKind = new Map<CreativeDocumentKind, CreativeStudioDescriptor>(CREATIVE_STUDIOS.map((studio) => [studio.kind, studio]));

export const creativeStudioForMode = (mode: MioSystemMode): CreativeStudioDescriptor | null => studioByMode.get(mode as CreativeStudioMode) ?? null;
export const creativeStudioForDocumentKind = (kind: CreativeDocumentKind): CreativeStudioDescriptor | null => studioByKind.get(kind) ?? null;
export const isCreativeStudioMode = (mode: MioSystemMode): mode is CreativeStudioMode => studioByMode.has(mode as CreativeStudioMode);

export const adjacentCreativeStudio = (mode: CreativeStudioMode, direction: -1 | 1): CreativeStudioMode => {
  const index = CREATIVE_STUDIOS.findIndex((studio) => studio.mode === mode);
  const safeIndex = index < 0 ? 0 : index;
  return CREATIVE_STUDIOS[(safeIndex + direction + CREATIVE_STUDIOS.length) % CREATIVE_STUDIOS.length].mode;
};

const isTextEditingTarget = (target: unknown): boolean => {
  if (!target || typeof target !== 'object') return false;
  const record = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (record.isContentEditable === true) return true;
  const tag = typeof record.tagName === 'string' ? record.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = typeof record.type === 'string' ? record.type.toLowerCase() : 'text';
  return !['button', 'checkbox', 'color', 'file', 'radio', 'range', 'reset', 'submit'].includes(type);
};

export interface CreativeShortcutInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

export const resolveCreativeShortcut = (input: CreativeShortcutInput): CreativeShortcutAction => {
  const key = input.key.toLowerCase();
  const primary = Boolean(input.ctrlKey || input.metaKey);
  const editingText = isTextEditingTarget(input.target);

  if (primary && !input.altKey && key === 's') return 'save';
  if (editingText) return null;
  if (primary && !input.altKey && key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (primary && !input.altKey && key === 'y') return 'redo';
  if (input.altKey && !primary && key === '[') return 'previous-studio';
  if (input.altKey && !primary && key === ']') return 'next-studio';
  return null;
};

export const createCreativeCopilotDraft = (mode: MioSystemMode, document?: Pick<CreativeDocument, 'name' | 'kind' | 'revision' | 'selection'>): string => {
  const studio = creativeStudioForMode(mode);
  const label = studio?.label ?? mode;
  const documentContext = document
    ? ` Dokumen aktif: ${document.name} (${document.kind}), revisi ${document.revision}, selection ${document.selection.nodeIds.length} item.`
    : '';
  return `Bertindak sebagai Creative Copilot untuk ${label}.${documentContext} Analisis tujuan saya dan usulkan perubahan yang paling relevan terlebih dahulu. Jangan mengubah dokumen, menjalankan pipeline kreatif, mengekspor, atau melakukan tindakan destruktif sebelum saya menyetujui proposalnya. Setelah disetujui, setiap perubahan harus melalui command/document kernel yang dapat di-undo dan mengikuti permission boundary Mio. Tujuan saya: `;
};
