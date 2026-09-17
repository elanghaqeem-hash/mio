import type { MioAnimationProject } from '../../types/creative';
import type { PoseControlState } from './PoseControlModel';
import type { RigViewportProjectionOptions } from './RigViewportProjection';
import { resolveRigViewportBinding } from './RigViewportBinding';
import { selectBoneAtViewportPoint } from './RigViewportSelectionController';
import {
  beginInteractivePoseSession,
  cancelInteractivePoseSession,
  commitInteractivePoseSession,
  updateInteractivePoseSession,
  type InteractivePoseCommit,
  type InteractivePoseSession,
} from './InteractivePoseSession';
import type { PointerPoint } from './TransformGizmoController';

export interface NativePoseViewportState {
  project: MioAnimationProject;
  control: PoseControlState;
  session?: InteractivePoseSession;
}

export const selectNativePoseBone = (
  state: NativePoseViewportState,
  point: PointerPoint,
  projection: RigViewportProjectionOptions,
  threshold = 14,
): NativePoseViewportState => {
  const binding = resolveRigViewportBinding(
    state.project,
    state.project.currentTime,
    state.control.selection?.rigId,
  );
  if (!binding.rig) return state;
  const selected = selectBoneAtViewportPoint(
    state.control,
    binding.rig,
    binding.poses,
    point,
    projection,
    threshold,
  );
  return { ...state, control: selected.control };
};

export const beginNativePoseDrag = (
  state: NativePoseViewportState,
  origin: PointerPoint,
  snapStep?: number,
): NativePoseViewportState => ({
  ...state,
  session: beginInteractivePoseSession(
    state.project,
    state.control,
    state.project.currentTime,
    origin,
    snapStep,
  ),
});

export const updateNativePoseDrag = (
  state: NativePoseViewportState,
  pointer: PointerPoint,
): NativePoseViewportState => {
  if (!state.session) return state;
  const session = updateInteractivePoseSession(state.session, pointer);
  return { ...state, session, project: session.transaction.previewProject };
};

export interface NativePoseViewportCommit extends NativePoseViewportState {
  commit?: InteractivePoseCommit;
}

export const commitNativePoseDrag = (state: NativePoseViewportState): NativePoseViewportCommit => {
  if (!state.session) return state;
  const commit = commitInteractivePoseSession(state.session);
  return { ...state, project: commit.project, session: undefined, commit };
};

export const cancelNativePoseDrag = (state: NativePoseViewportState): NativePoseViewportState => {
  if (!state.session) return state;
  return { ...state, project: cancelInteractivePoseSession(state.session), session: undefined };
};
