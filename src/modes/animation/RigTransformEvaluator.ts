import type { AnimationRig, BonePose } from '../../types/creative';
import type { Vec3 } from './IKSolver';

export type Quat = [number, number, number, number];

export interface WorldBoneTransform {
  boneId: string;
  head: Vec3;
  tail: Vec3;
  rotation: Vec3;
  quaternion: Quat;
}

export interface RigTransformEvaluation {
  bones: Record<string, WorldBoneTransform>;
  order: string[];
}

const EPSILON = 1e-9;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const quaternionMultiply = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const quaternionNormalize = (q: Quat): Quat => {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  return length > EPSILON ? [q[0] / length, q[1] / length, q[2] / length, q[3] / length] : [0, 0, 0, 1];
};
export const quaternionSlerp = (a: Quat, b: Quat, t: number): Quat => {
  const weight = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  let from = quaternionNormalize(a), to = quaternionNormalize(b);
  let dot = from[0]*to[0]+from[1]*to[1]+from[2]*to[2]+from[3]*to[3];
  if (dot < 0) { to = [-to[0],-to[1],-to[2],-to[3]]; dot = -dot; }
  if (dot > 0.9995) return quaternionNormalize([from[0]+weight*(to[0]-from[0]),from[1]+weight*(to[1]-from[1]),from[2]+weight*(to[2]-from[2]),from[3]+weight*(to[3]-from[3])]);
  const theta0=Math.acos(Math.max(-1,Math.min(1,dot))),sin0=Math.sin(theta0),theta=theta0*weight;
  const s0=Math.sin(theta0-theta)/sin0,s1=Math.sin(theta)/sin0;
  return quaternionNormalize([from[0]*s0+to[0]*s1,from[1]*s0+to[1]*s1,from[2]*s0+to[2]*s1,from[3]*s0+to[3]*s1]);
};
export const quaternionInverse = (q: Quat): Quat => {
  const normalized = quaternionNormalize(q);
  return [-normalized[0], -normalized[1], -normalized[2], normalized[3]];
};

export const eulerXYZToQuaternion = ([x, y, z]: Vec3): Quat => {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return quaternionNormalize([
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]);
};

export const quaternionToEulerXYZ = (q: Quat): Vec3 => {
  const [x, y, z, w] = quaternionNormalize(q);
  const sinX = 2 * (w * x - y * z);
  const cosX = 1 - 2 * (x * x + y * y);
  const sinY = Math.max(-1, Math.min(1, 2 * (w * y + z * x)));
  const sinZ = 2 * (w * z - x * y);
  const cosZ = 1 - 2 * (y * y + z * z);
  return [Math.atan2(sinX, cosX), Math.asin(sinY), Math.atan2(sinZ, cosZ)];
};

export const rotateByQuaternion = (value: Vec3, q: Quat): Vec3 => {
  const normalized = quaternionNormalize(q);
  const vector: Quat = [value[0], value[1], value[2], 0];
  const rotated = quaternionMultiply(quaternionMultiply(normalized, vector), quaternionInverse(normalized));
  return [rotated[0], rotated[1], rotated[2]];
};

const finiteVec3 = (value: Vec3, label: string): Vec3 => {
  if (!value.every(Number.isFinite)) throw new Error(`${label} must contain finite numbers`);
  return [...value];
};

export const evaluateRigWorldTransforms = (
  rig: AnimationRig,
  poses: Record<string, BonePose> = {},
): RigTransformEvaluation => {
  const byId = new Map<string, AnimationRig['bones'][number]>();
  for (const bone of rig.bones) {
    if (byId.has(bone.id)) throw new Error(`Duplicate bone id: ${bone.id}`);
    byId.set(bone.id, bone);
  }
  for (const bone of rig.bones) {
    if (bone.parentId && !byId.has(bone.parentId)) throw new Error(`Orphan bone ${bone.id}: parent ${bone.parentId} not found`);
  }

  const bones: Record<string, WorldBoneTransform> = {};
  const order: string[] = [];
  const visiting = new Set<string>();

  const visit = (boneId: string): WorldBoneTransform => {
    if (bones[boneId]) return bones[boneId];
    if (visiting.has(boneId)) throw new Error(`Bone hierarchy cycle detected at ${boneId}`);
    const bone = byId.get(boneId);
    if (!bone) throw new Error(`Bone ${boneId} not found`);
    visiting.add(boneId);

    const pose = poses[bone.id] ?? bone.pose;
    const localPosition = finiteVec3(pose.position, `Bone ${bone.id} position`);
    const localRotation = finiteVec3(pose.rotation, `Bone ${bone.id} rotation`);
    const localQuaternion = eulerXYZToQuaternion(localRotation);
    const parent = bone.parentId ? visit(bone.parentId) : undefined;
    const quaternion = parent ? quaternionNormalize(quaternionMultiply(parent.quaternion, localQuaternion)) : localQuaternion;
    const head = parent
      ? bone.connected
        ? parent.tail
        : add(parent.head, rotateByQuaternion(localPosition, parent.quaternion))
      : localPosition;
    const length = Math.max(0, Number.isFinite(bone.length) ? bone.length : 0);
    const tail = add(head, rotateByQuaternion([0, length, 0], quaternion));
    const result: WorldBoneTransform = {
      boneId: bone.id,
      head: [...head],
      tail,
      rotation: quaternionToEulerXYZ(quaternion),
      quaternion,
    };
    bones[bone.id] = result;
    order.push(bone.id);
    visiting.delete(boneId);
    return result;
  };

  for (const bone of rig.bones) visit(bone.id);
  return { bones, order };
};
