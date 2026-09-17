import type { AnimationRig, BonePose } from '../../types/creative';
import type { PoseControlState } from './PoseControlModel';
import { selectBone } from './PoseControlModel';
import { buildRigViewportModel } from './RigViewportModel';
import {
  pickProjectedBone,
  projectRigViewportModel,
  type RigViewportProjectionOptions,
  type ViewportPoint,
} from './RigViewportProjection';

export interface RigViewportSelectionResult {
  control: PoseControlState;
  selectedBoneId?: string;
}

export const selectBoneAtViewportPoint = (
  control: PoseControlState,
  rig: AnimationRig,
  poses: Record<string, BonePose>,
  point: ViewportPoint,
  projection: RigViewportProjectionOptions,
  threshold = 14,
): RigViewportSelectionResult => {
  const model = buildRigViewportModel(
    rig,
    poses,
    control.selection?.rigId === rig.id ? control.selection.boneId : undefined,
  );
  const projected = projectRigViewportModel(model, projection);
  const boneId = pickProjectedBone(projected, point, threshold);
  if (!boneId) return { control, selectedBoneId: control.selection?.rigId === rig.id ? control.selection.boneId : undefined };
  return {
    control: selectBone(control, { rigId: rig.id, boneId }),
    selectedBoneId: boneId,
  };
};
