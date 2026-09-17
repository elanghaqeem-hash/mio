import type { Vec3 } from './IKSolver';
import {
  quaternionMultiply,
  quaternionNormalize,
  type Quat,
} from './RigTransformEvaluator';

const EPSILON = 1e-9;
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (value: Vec3): Vec3 | undefined => {
  const magnitude = Math.hypot(value[0], value[1], value[2]);
  return magnitude > EPSILON ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude] : undefined;
};

export const quaternionFromTo = (from: Vec3, to: Vec3): Quat | undefined => {
  const a = normalize(from);
  const b = normalize(to);
  if (!a || !b) return undefined;
  const cosine = Math.max(-1, Math.min(1, dot(a, b)));
  if (cosine > 1 - EPSILON) return [0, 0, 0, 1];
  if (cosine < -1 + EPSILON) {
    const fallback: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const axis = normalize(cross(a, fallback)) ?? [0, 0, 1];
    return [axis[0], axis[1], axis[2], 0];
  }
  const axis = cross(a, b);
  return quaternionNormalize([axis[0], axis[1], axis[2], 1 + cosine]);
};

export const quaternionAxisAngle = (axis: Vec3, angle: number): Quat => {
  const normalized = normalize(axis) ?? [0, 1, 0];
  const half = angle / 2;
  const sine = Math.sin(half);
  return quaternionNormalize([normalized[0] * sine, normalized[1] * sine, normalized[2] * sine, Math.cos(half)]);
};

export const aimBoneQuaternion = (
  head: Vec3,
  tail: Vec3,
  poleAngle = 0,
): Quat | undefined => {
  const direction = subtract(tail, head);
  const aim = quaternionFromTo([0, 1, 0], direction);
  if (!aim) return undefined;
  if (!Number.isFinite(poleAngle) || Math.abs(poleAngle) < EPSILON) return aim;
  const normalizedDirection = normalize(direction);
  if (!normalizedDirection) return aim;
  const twist = quaternionAxisAngle(normalizedDirection, poleAngle);
  return quaternionNormalize(quaternionMultiply(twist, aim));
};
