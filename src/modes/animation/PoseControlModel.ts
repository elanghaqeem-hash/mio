import type { AnimationBone, AnimationRig, MioAnimationProject } from '../../types/creative';
import type { PoseAxis, PoseTool } from './PoseOperations';

export interface PoseSelection {
  rigId: string;
  boneId: string;
}

export interface PoseControlState {
  selection?: PoseSelection;
  tool: PoseTool;
  axis: PoseAxis;
  autoKey: boolean;
}

export interface SelectedBoneContext {
  rig: AnimationRig;
  bone: AnimationBone;
}

export const DEFAULT_POSE_CONTROL_STATE: PoseControlState = {
  tool: 'ROTATE',
  axis: 'z',
  autoKey: false,
};

export const resolveSelectedBone = (
  project: MioAnimationProject,
  selection?: PoseSelection,
): SelectedBoneContext | undefined => {
  if (!selection) return undefined;
  const rig = project.rigs?.find(candidate => candidate.id === selection.rigId);
  const bone = rig?.bones.find(candidate => candidate.id === selection.boneId);
  return rig && bone ? { rig, bone } : undefined;
};

export const selectBone = (state: PoseControlState, rigId: string, boneId: string): PoseControlState => ({
  ...state,
  selection: { rigId, boneId },
});

export const setPoseTool = (state: PoseControlState, tool: PoseTool): PoseControlState => ({ ...state, tool });
export const setPoseAxis = (state: PoseControlState, axis: PoseAxis): PoseControlState => ({ ...state, axis });
export const setPoseAutoKey = (state: PoseControlState, autoKey: boolean): PoseControlState => ({ ...state, autoKey });
