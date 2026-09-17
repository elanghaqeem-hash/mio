import type { AnimationRig, BonePose } from '../../types/creative';
import { evaluateRigWorldTransforms } from './RigTransformEvaluator';

export interface BoneGizmo {
  id: string;
  name: string;
  parentId?: string;
  head: [number, number, number];
  tail: [number, number, number];
  selected: boolean;
  ikFk: 'IK' | 'FK';
}

export interface RigViewportModel {
  bones: BoneGizmo[];
  selectedBoneId?: string;
}

export const buildRigViewportModel = (
  rig: AnimationRig,
  poses: Record<string, BonePose>,
  selectedBoneId?: string,
): RigViewportModel => {
  const world = evaluateRigWorldTransforms(rig, poses);
  const byId = new Map(rig.bones.map(bone => [bone.id, bone]));
  const bones = world.order.map(id => {
    const bone = byId.get(id);
    const transform = world.bones[id];
    if (!bone || !transform) throw new Error(`Unable to build viewport gizmo for bone ${id}`);
    return {
      id: bone.id,
      name: bone.name,
      parentId: bone.parentId,
      head: [...transform.head] as [number, number, number],
      tail: [...transform.tail] as [number, number, number],
      selected: bone.id === selectedBoneId,
      ikFk: bone.ikFk,
    };
  });
  return { bones, selectedBoneId };
};

export const pickNearestBone = (
  model: RigViewportModel,
  point: [number, number],
  project: (point: [number, number, number]) => [number, number],
  threshold = 16,
): string | undefined => {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Bone pick threshold must be a finite non-negative number');
  let best: { id: string; distance: number } | undefined;
  for (const bone of model.bones) {
    const a = project(bone.head);
    const b = project(bone.tail);
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const wx = point[0] - a[0];
    const wy = point[1] - a[1];
    const denominator = vx * vx + vy * vy;
    const t = denominator ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / denominator)) : 0;
    const dx = point[0] - (a[0] + vx * t);
    const dy = point[1] - (a[1] + vy * t);
    const distance = Math.hypot(dx, dy);
    if (distance <= threshold && (!best || distance < best.distance)) best = { id: bone.id, distance };
  }
  return best?.id;
};
