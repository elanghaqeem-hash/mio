import type { AnimationConstraint, AnimationRig, AnimationTrack, BonePose, MioAnimationProject } from '../../types/creative';
import type { BoneTransformChannel } from './AutoKeyOperations';
import { solveTwoBoneIK } from './IKSolver';
import { aimBoneQuaternion } from './QuaternionAim';
import { evaluateBezierSegment } from './BezierCurve';
import { evaluateNLAChannels } from './AnimationNLAEvaluator';
import {
  evaluateRigWorldTransforms,
  quaternionInverse,
  quaternionMultiply,
  quaternionNormalize,
  quaternionToEulerXYZ,
  type Quat,
} from './RigTransformEvaluator';

export interface EvaluatedAnimationState {
  objectChannels: Record<string, Record<string, number>>;
  bonePoses: Record<string, BonePose>;
  activeShotId?: string;
}

interface BoneTrackTarget { rigId: string; boneId: string; }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const clonePose = (pose: BonePose): BonePose => ({ position: [...pose.position], rotation: [...pose.rotation], scale: [...pose.scale] });

const localEulerFromWorldQuaternion = (worldQuaternion: Quat, parentWorld: Quat = [0, 0, 0, 1]): [number, number, number] => {
  const localQuaternion = quaternionNormalize(quaternionMultiply(quaternionInverse(parentWorld), worldQuaternion));
  return quaternionToEulerXYZ(localQuaternion);
};

export const parseBoneTargetId = (targetObjectId: string): BoneTrackTarget | undefined => {
  if (!targetObjectId.startsWith('bone:')) return undefined;
  const parts = targetObjectId.split(':');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return undefined;
  return { rigId: parts[1], boneId: parts[2] };
};

export const evaluateTrack = (track: AnimationTrack, time: number): number => {
  if (!Number.isFinite(time)) throw new Error('Animation evaluation time must be finite');
  const keys = [...track.keyframes].filter(key => Number.isFinite(key.time)).sort((a, b) => a.time - b.time);
  if (!keys.length) return 0;
  if (time <= keys[0].time) return Number(keys[0].value) || 0;
  if (time >= keys[keys.length - 1].time) return Number(keys[keys.length - 1].value) || 0;
  const right = keys.findIndex(key => key.time >= time);
  const a = keys[right - 1];
  const b = keys[right];
  if (a.interpolation === 'step' || Math.abs(b.time - a.time) < 1e-9) return Number(a.value) || 0;
  if (a.interpolation === 'bezier') return evaluateBezierSegment(a, b, time);
  let t = (time - a.time) / (b.time - a.time);
  if (a.interpolation === 'easeIn') t *= t;
  else if (a.interpolation === 'easeOut') t = 1 - (1 - t) * (1 - t);
  else if (a.interpolation === 'easeInOut') t = ease(t);
  return lerp(Number(a.value) || 0, Number(b.value) || 0, t);
};

const channelFromTrack = (track: AnimationTrack): BoneTransformChannel | undefined => {
  const suffix = track.id.split(':').slice(3).join(':');
  const channels: BoneTransformChannel[] = ['position.x', 'position.y', 'position.z', 'rotation.x', 'rotation.y', 'rotation.z', 'scale.x', 'scale.y', 'scale.z'];
  return channels.includes(suffix as BoneTransformChannel) ? suffix as BoneTransformChannel : undefined;
};

const applyBoneChannel = (pose: BonePose, channel: BoneTransformChannel, value: number) => {
  const [group, axis] = channel.split('.') as ['position' | 'rotation' | 'scale', 'x' | 'y' | 'z'];
  pose[group][axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = value;
};

export const evaluateBoneTracks = (project: MioAnimationProject, time: number, values?: Map<string,{track:AnimationTrack;value:number}>): Record<string, BonePose> => {
  const poses: Record<string, BonePose> = {};
  for (const rig of project.rigs ?? []) for (const bone of rig.bones) poses[`${rig.id}:${bone.id}`] = clonePose(bone.pose);
  for (const track of project.tracks) {
    const target = parseBoneTargetId(track.targetObjectId);
    if (!target) continue;
    const pose = poses[`${target.rigId}:${target.boneId}`];
    const channel = channelFromTrack(track);
    if (pose && channel) applyBoneChannel(pose, channel, values?.get(track.id)?.value ?? evaluateTrack(track, time));
  }
  return poses;
};

const rigLocalPoses = (rig: AnimationRig, poses: Record<string, BonePose>): Record<string, BonePose> => {
  const local: Record<string, BonePose> = {};
  for (const bone of rig.bones) local[bone.id] = poses[`${rig.id}:${bone.id}`] ?? bone.pose;
  return local;
};

const solveRigIK = (rig: AnimationRig, constraint: AnimationConstraint, poses: Record<string, BonePose>) => {
  if (!constraint.boneId || !constraint.targetId) return;
  const endBone = rig.bones.find(bone => bone.id === constraint.boneId);
  const upperBone = endBone?.parentId ? rig.bones.find(bone => bone.id === endBone.parentId) : undefined;
  if (!endBone || !upperBone) return;

  const world = evaluateRigWorldTransforms(rig, rigLocalPoses(rig, poses));
  const upperWorld = world.bones[upperBone.id];
  const targetWorld = world.bones[constraint.targetId];
  const poleWorld = constraint.poleTargetId ? world.bones[constraint.poleTargetId] : undefined;
  if (!upperWorld || !targetWorld) return;

  const result = solveTwoBoneIK({
    root: upperWorld.head,
    target: targetWorld.head,
    pole: poleWorld?.head,
    upperLength: upperBone.length,
    lowerLength: endBone.length,
  });
  const upperWorldQuaternion = aimBoneQuaternion(upperWorld.head, result.joint, constraint.poleAngle ?? 0);
  const endWorldQuaternion = aimBoneQuaternion(result.joint, result.end, constraint.poleAngle ?? 0);
  if (!upperWorldQuaternion || !endWorldQuaternion) return;

  const upperKey = `${rig.id}:${upperBone.id}`;
  const endKey = `${rig.id}:${endBone.id}`;
  const upperPose = poses[upperKey];
  const endPose = poses[endKey];
  if (!upperPose || !endPose) return;
  const parentWorld = upperBone.parentId ? world.bones[upperBone.parentId]?.quaternion : undefined;
  const desiredUpperLocal = localEulerFromWorldQuaternion(upperWorldQuaternion, parentWorld);
  const desiredEndLocal = localEulerFromWorldQuaternion(endWorldQuaternion, upperWorldQuaternion);
  const weight = Math.max(0, Math.min(1, constraint.influence));
  for (let i = 0; i < 3; i++) {
    upperPose.rotation[i] = lerp(upperPose.rotation[i], desiredUpperLocal[i], weight);
    endPose.rotation[i] = lerp(endPose.rotation[i], desiredEndLocal[i], weight);
  }
};

export const applyConstraints = (
  rigs: AnimationRig[],
  constraints: AnimationConstraint[],
  evaluatedPoses: Record<string, BonePose> = {},
): Record<string, BonePose> => {
  const poses: Record<string, BonePose> = {};
  for (const rig of rigs) for (const bone of rig.bones) {
    const key = `${rig.id}:${bone.id}`;
    poses[key] = clonePose(evaluatedPoses[key] ?? bone.pose);
  }
  for (const rig of rigs) for (const constraint of constraints.filter(candidate => candidate.enabled && candidate.influence > 0)) {
    if (!constraint.boneId) continue;
    const key = `${rig.id}:${constraint.boneId}`;
    const pose = poses[key];
    if (!pose) continue;
    if (constraint.type === 'LIMIT_ROTATION') for (let i = 0; i < 3; i++) {
      const min = constraint.minRotation?.[i] ?? -Infinity;
      const max = constraint.maxRotation?.[i] ?? Infinity;
      pose.rotation[i] = Math.max(min, Math.min(max, pose.rotation[i]));
    }
    const targetKey = constraint.targetId ? `${rig.id}:${constraint.targetId}` : undefined;
    if (constraint.type === 'COPY_TRANSFORM' && targetKey && poses[targetKey]) {
      const target = poses[targetKey];
      const weight = Math.max(0, Math.min(1, constraint.influence));
      for (let i = 0; i < 3; i++) {
        pose.position[i] = lerp(pose.position[i], target.position[i], weight);
        pose.rotation[i] = lerp(pose.rotation[i], target.rotation[i], weight);
      }
    }
    if (constraint.type === 'IK') solveRigIK(rig, constraint, poses);
  }
  return poses;
};

export const evaluateAnimationProject = (project: MioAnimationProject, time: number): EvaluatedAnimationState => {
  const objectChannels: Record<string, Record<string, number>> = {};
  const nlaValues = evaluateNLAChannels(project, time);
  for (const track of project.tracks) {
    if (parseBoneTargetId(track.targetObjectId)) continue;
    objectChannels[track.targetObjectId] ??= {};
    objectChannels[track.targetObjectId][track.property] = nlaValues.get(track.id)?.value ?? evaluateTrack(track, time);
  }
  const evaluatedBonePoses = evaluateBoneTracks(project, time, nlaValues);
  const activeShot = project.shots?.find(shot => time >= shot.start && time < shot.end)
    ?? project.shots?.find(shot => time === shot.end && shot.end === project.duration);
  return {
    objectChannels,
    bonePoses: applyConstraints(project.rigs ?? [], project.constraints ?? [], evaluatedBonePoses),
    activeShotId: activeShot?.id,
  };
};
