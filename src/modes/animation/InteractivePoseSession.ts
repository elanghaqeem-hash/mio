import type { MioAnimationProject } from '../../types/creative';
import type { PoseControlState } from './PoseControlModel';
import {
  beginPoseDragTransaction,
  cancelPoseDrag,
  commitPoseDrag,
  previewPoseDrag,
  type PoseDragTransaction,
} from './PoseDragTransaction';
import {
  beginTransformGizmoDrag,
  snapTransformDelta,
  transformGizmoDelta,
  type PointerPoint,
  type TransformGizmoDrag,
} from './TransformGizmoController';

export interface InteractivePoseSession {
  gizmo: TransformGizmoDrag;
  transaction: PoseDragTransaction;
  snapStep?: number;
}

export const beginInteractivePoseSession = (
  project: MioAnimationProject,
  control: PoseControlState,
  time: number,
  origin: PointerPoint,
  snapStep?: number,
): InteractivePoseSession => ({
  gizmo: beginTransformGizmoDrag(control.tool, control.axis, origin),
  transaction: beginPoseDragTransaction(project, control, time),
  snapStep,
});

export const updateInteractivePoseSession = (
  session: InteractivePoseSession,
  pointer: PointerPoint,
): InteractivePoseSession => {
  const rawDelta = transformGizmoDelta(session.gizmo, pointer);
  const delta = snapTransformDelta(rawDelta, session.snapStep);
  return { ...session, transaction: previewPoseDrag(session.transaction, delta) };
};

export interface InteractivePoseCommit {
  project: MioAnimationProject;
  keyedChannels: string[];
  delta: number;
}

export const commitInteractivePoseSession = (session: InteractivePoseSession): InteractivePoseCommit => {
  const committed = commitPoseDrag(session.transaction);
  return {
    project: committed.previewProject,
    keyedChannels: committed.keyedChannels,
    delta: committed.accumulatedDelta,
  };
};

export const cancelInteractivePoseSession = (session: InteractivePoseSession): MioAnimationProject =>
  cancelPoseDrag(session.transaction);
