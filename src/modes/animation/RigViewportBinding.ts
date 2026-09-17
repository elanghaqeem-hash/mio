import type { AnimationRig, BonePose, MioAnimationProject } from '../../types/creative';
import { evaluateAnimationProject } from './AnimationRuntime';

export interface RigViewportBinding {
  rig?: AnimationRig;
  poses: Record<string, BonePose>;
}

export const resolveRigViewportBinding = (
  project: MioAnimationProject,
  time: number,
  selectedRigId?: string,
  selectedObjectId?: string,
): RigViewportBinding => {
  const rigs = project.rigs ?? [];
  const rig = (selectedRigId ? rigs.find(candidate => candidate.id === selectedRigId) : undefined)
    ?? (selectedObjectId ? rigs.find(candidate => candidate.objectId === selectedObjectId) : undefined)
    ?? rigs[0];
  if (!rig) return { poses: {} };

  const evaluated = evaluateAnimationProject(project, time);
  const poses: Record<string, BonePose> = {};
  for (const bone of rig.bones) {
    poses[bone.id] = evaluated.bonePoses[`${rig.id}:${bone.id}`] ?? bone.pose;
  }
  return { rig, poses };
};
