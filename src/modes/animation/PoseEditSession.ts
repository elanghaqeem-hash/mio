import type { MioAnimationProject } from '../../types/creative';
import { autoKeyBoneTransform, type BoneTransformChannel } from './AutoKeyOperations';
import { rotateBone, translateBone, type PoseAxis } from './PoseOperations';

export type PoseTool = 'TRANSLATE' | 'ROTATE';

export interface PoseEditRequest {
  rigId: string;
  boneId: string;
  tool: PoseTool;
  axis: PoseAxis;
  delta: number;
  time: number;
  autoKey: boolean;
}

export interface PoseEditResult {
  project: MioAnimationProject;
  keyedChannels: BoneTransformChannel[];
}

const channelFor = (tool: PoseTool, axis: PoseAxis): BoneTransformChannel =>
  `${tool === 'TRANSLATE' ? 'position' : 'rotation'}.${axis}` as BoneTransformChannel;

export const applyPoseEdit = (project: MioAnimationProject, request: PoseEditRequest): PoseEditResult => {
  if (!Number.isFinite(request.delta) || !Number.isFinite(request.time)) throw new Error('Pose edit requires finite delta and time');
  const posed = request.tool === 'TRANSLATE'
    ? translateBone(project, request.rigId, request.boneId, request.axis, request.delta)
    : rotateBone(project, request.rigId, request.boneId, request.axis, request.delta);
  if (!request.autoKey) return { project: posed, keyedChannels: [] };
  const channel = channelFor(request.tool, request.axis);
  return {
    project: autoKeyBoneTransform(posed, request.rigId, request.boneId, request.time, [channel]),
    keyedChannels: [channel],
  };
};
