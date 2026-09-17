import type { AnimationInterpolation, AnimationTrack, MioAnimationProject } from '../../types/creative';

export type BoneTransformChannel =
  | 'position.x' | 'position.y' | 'position.z'
  | 'rotation.x' | 'rotation.y' | 'rotation.z'
  | 'scale.x' | 'scale.y' | 'scale.z';

const clone = <T>(value: T): T => structuredClone(value);
const trackId = (rigId: string, boneId: string, channel: BoneTransformChannel) => `bone:${rigId}:${boneId}:${channel}`;

const channelValue = (project: MioAnimationProject, rigId: string, boneId: string, channel: BoneTransformChannel): number => {
  const bone = project.rigs?.find(r => r.id === rigId)?.bones.find(b => b.id === boneId);
  if (!bone) throw new Error(`Bone ${boneId} not found in rig ${rigId}`);
  const [group, axis] = channel.split('.') as ['position' | 'rotation' | 'scale', 'x' | 'y' | 'z'];
  return bone.pose[group][axis === 'x' ? 0 : axis === 'y' ? 1 : 2];
};

export const upsertBoneKeyframe = (
  project: MioAnimationProject,
  rigId: string,
  boneId: string,
  channel: BoneTransformChannel,
  time: number,
  interpolation: AnimationInterpolation = 'easeInOut',
): MioAnimationProject => {
  const next = clone(project);
  const id = trackId(rigId, boneId, channel);
  const value = channelValue(project, rigId, boneId, channel);
  let track = next.tracks.find(t => t.id === id);
  if (!track) {
    const property: AnimationTrack['property'] = channel.startsWith('scale.') ? 'scale' : channel as AnimationTrack['property'];
    const created: AnimationTrack = { id, targetObjectId: `bone:${rigId}:${boneId}`, property, keyframes: [] };
    next.tracks.push(created);
    track = created;
  }
  const existing = track.keyframes.find(k => Math.abs(k.time - time) < 1e-6);
  if (existing) {
    existing.value = value;
    existing.interpolation = interpolation;
  } else {
    track.keyframes.push({ time, value, interpolation });
  }
  track.keyframes.sort((a, b) => a.time - b.time);
  return next;
};

export const autoKeyBoneTransform = (
  project: MioAnimationProject,
  rigId: string,
  boneId: string,
  time: number,
  channels: BoneTransformChannel[] = ['position.x', 'position.y', 'position.z', 'rotation.x', 'rotation.y', 'rotation.z'],
): MioAnimationProject => channels.reduce((state, channel) => upsertBoneKeyframe(state, rigId, boneId, channel, time), project);

export const removeBoneKeyframe = (project: MioAnimationProject, rigId: string, boneId: string, channel: BoneTransformChannel, time: number): MioAnimationProject => {
  const next = clone(project);
  const track = next.tracks.find(t => t.id === trackId(rigId, boneId, channel));
  if (track) track.keyframes = track.keyframes.filter(k => Math.abs(k.time - time) >= 1e-6);
  return next;
};
