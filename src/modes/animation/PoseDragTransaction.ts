import type { MioAnimationProject } from '../../types/creative';
import type { PoseControlState } from './PoseControlModel';
import { applyViewportPoseEdit } from './PoseViewportController';

export interface PoseDragTransaction {
  baseProject: MioAnimationProject;
  previewProject: MioAnimationProject;
  control: PoseControlState;
  time: number;
  accumulatedDelta: number;
  keyedChannels: string[];
}

const assertFinite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
};

export const beginPoseDragTransaction = (
  project: MioAnimationProject,
  control: PoseControlState,
  time: number,
): PoseDragTransaction => {
  assertFinite(time, 'Pose drag time');
  if (!control.selection) throw new Error('Pose drag requires a selected bone');
  return {
    baseProject: project,
    previewProject: project,
    control,
    time,
    accumulatedDelta: 0,
    keyedChannels: [],
  };
};

export const previewPoseDrag = (
  transaction: PoseDragTransaction,
  accumulatedDelta: number,
): PoseDragTransaction => {
  assertFinite(accumulatedDelta, 'Pose drag delta');
  const previewControl = transaction.control.autoKey
    ? { ...transaction.control, autoKey: false }
    : transaction.control;
  const result = applyViewportPoseEdit(transaction.baseProject, previewControl, {
    delta: accumulatedDelta,
    time: transaction.time,
    orientation: transaction.control.orientation,
  });
  return {
    ...transaction,
    previewProject: result.project,
    accumulatedDelta,
    keyedChannels: [],
  };
};

export const commitPoseDrag = (transaction: PoseDragTransaction): PoseDragTransaction => {
  if (transaction.accumulatedDelta === 0) return transaction;
  const result = applyViewportPoseEdit(transaction.baseProject, transaction.control, {
    delta: transaction.accumulatedDelta,
    time: transaction.time,
    orientation: transaction.control.orientation,
  });
  return {
    ...transaction,
    previewProject: result.project,
    keyedChannels: result.keyedChannels,
  };
};

export const cancelPoseDrag = (transaction: PoseDragTransaction): MioAnimationProject => transaction.baseProject;
