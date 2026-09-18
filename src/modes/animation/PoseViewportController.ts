import type { MioAnimationProject } from '../../types/creative';
import { applyPoseEdit, type PoseEditResult } from './PoseEditSession';
import { rotateBoneWorld, translateBoneWorld } from './WorldTransformOperations';
import { autoKeyBoneTransform, type BoneTransformChannel } from './AutoKeyOperations';
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
  if (edit.orientation === 'WORLD') {
    const transformed = controls.tool === 'TRANSLATE'
      ? translateBoneWorld(project, controls.selection.rigId, controls.selection.boneId, controls.axis, edit.delta)
      : rotateBoneWorld(project, controls.selection.rigId, controls.selection.boneId, controls.axis, edit.delta);
    const before = selected.bone.pose;
    const after = transformed.rigs?.find(r => r.id === controls.selection!.rigId)?.bones.find(b => b.id === controls.selection!.boneId)?.pose;
    if (!after) throw new Error('Transformed bone disappeared during WORLD pose edit');
    const group = controls.tool === 'TRANSLATE' ? 'position' : 'rotation';
    const axes = ['x', 'y', 'z'] as const;
    const changed = axes.filter((_, i) => Math.abs(after[group][i] - before[group][i]) > 1e-9).map(axis => `${group}.${axis}` as BoneTransformChannel);
    const keyed = controls.autoKey && changed.length ? autoKeyBoneTransform(transformed, controls.selection.rigId, controls.selection.boneId, edit.time, changed) : transformed;
    return { project: keyed, keyedChannels: controls.autoKey ? changed : [] };
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
