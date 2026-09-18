import type { MioAnimationProject } from '../../types/creative';
import { applyPoseEdit, type PoseEditResult } from './PoseEditSession';
import { rotateBoneWorld, translateBoneWorld } from './WorldTransformOperations';
import { resolveSelectedBone, type PoseControlState } from './PoseControlModel';

export interface PoseViewportEdit {
  delta: number;
  time: number;
  orientation?: 'WORLD' | 'LOCAL';
}

export const applyViewportPoseEdit = (
  project: MioAnimationProject,
  controls: PoseControlState,
  edit: PoseViewportEdit,
): PoseEditResult => {
  const selected = resolveSelectedBone(project, controls.selection);
  if (!selected || !controls.selection) throw new Error('Select a valid animation bone before editing its pose');
  if (edit.orientation === 'WORLD' && controls.tool !== 'SCALE') {
    const transformed = controls.tool === 'TRANSLATE'
      ? translateBoneWorld(project, controls.selection.rigId, controls.selection.boneId, controls.axis, edit.delta)
      : rotateBoneWorld(project, controls.selection.rigId, controls.selection.boneId, controls.axis, edit.delta);
    return { project: transformed, keyedChannels: [] };
  }
  return applyPoseEdit(project, {
    rigId: controls.selection.rigId,
    boneId: controls.selection.boneId,
    tool: controls.tool,
    axis: controls.axis,
    delta: edit.delta,
    time: edit.time,
    autoKey: controls.autoKey,
  });
};

export const frameTime = (frame: number, fps: number): number => {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) throw new Error('Frame and FPS must be finite; FPS must be greater than zero');
  return Math.max(0, Math.round(frame)) / fps;
};
