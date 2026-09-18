import type { AnimationBone, AnimationRig, MioAnimationProject } from '../../types/creative';
import type { PoseAxis } from './PoseOperations';
import type { PoseTool } from './PoseEditSession';

export interface PoseSelection {
  rigId: string;
  boneId: string;
}

export interface PoseControlState {
  selection?: PoseSelection;
  tool: PoseTool;
  axis: PoseAxis;
  autoKey: boolean;
  orientation?: 'WORLD' | 'LOCAL';
}

export interface SelectedBoneContext {
  rig: AnimationRig;
  bone: AnimationBone;
}

export const DEFAULT_POSE_CONTROL_STATE: PoseControlState = {
  tool: 'ROTATE',
  axis: 'z',
  autoKey: false,
  orientation: 'LOCAL',
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

export function selectBone(state: PoseControlState, selection: PoseSelection): PoseControlState;
export function selectBone(state: PoseControlState, rigId: string, boneId: string): PoseControlState;
export function selectBone(
  state: PoseControlState,
  selectionOrRigId: PoseSelection | string,
  boneId?: string,
): PoseControlState {
  const selection = typeof selectionOrRigId === 'string'
    ? { rigId: selectionOrRigId, boneId: boneId ?? '' }
    : selectionOrRigId;

  if (!selection.rigId || !selection.boneId) return state;
  return { ...state, selection };
}

export const setPoseTool = (state: PoseControlState, tool: PoseTool): PoseControlState => ({ ...state, tool });
export const setPoseAxis = (state: PoseControlState, axis: PoseAxis): PoseControlState => ({ ...state, axis });
export const setPoseAutoKey = (state: PoseControlState, autoKey: boolean): PoseControlState => ({ ...state, autoKey });
