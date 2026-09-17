import type { AnimationRig, BonePose } from '../../types/creative';
import type { Vec3 } from './IKSolver';

export interface WorldBoneTransform {
  boneId: string;
  head: Vec3;
  tail: Vec3;
  rotation: Vec3;
}

export interface RigTransformEvaluation {
  bones: Record<string, WorldBoneTransform>;
  order: string[];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const rotateEulerXYZ = (value: Vec3, rotation: Vec3): Vec3 => {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x1 = value[0];
  const y1 = value[1] * cx - value[2] * sx;
  const z1 = value[1] * sx + value[2] * cx;
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;
  return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2];
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
    const parent = bone.parentId ? visit(bone.parentId) : undefined;
    const worldRotation: Vec3 = parent ? add(parent.rotation, localRotation) : localRotation;
    const head = parent
      ? bone.connected
        ? parent.tail
        : add(parent.head, rotateEulerXYZ(localPosition, parent.rotation))
      : localPosition;
    const length = Math.max(0, Number.isFinite(bone.length) ? bone.length : 0);
    const tail = add(head, rotateEulerXYZ([0, length, 0], worldRotation));
    const result: WorldBoneTransform = { boneId: bone.id, head: [...head], tail, rotation: worldRotation };
    bones[bone.id] = result;
    order.push(bone.id);
    visiting.delete(boneId);
    return result;
  };

  for (const bone of rig.bones) visit(bone.id);
  return { bones, order };
};
