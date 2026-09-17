export type Vec3 = [number, number, number];

export interface TwoBoneIKInput {
  root: Vec3;
  target: Vec3;
  pole?: Vec3;
  upperLength: number;
  lowerLength: number;
}

export interface TwoBoneIKResult {
  joint: Vec3;
  end: Vec3;
  reachable: boolean;
}

const EPSILON = 1e-6;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, scalar: number): Vec3 => [a[0] * scalar, a[1] * scalar, a[2] * scalar];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (value: Vec3) => Math.sqrt(dot(value, value));
const normalize = (value: Vec3, fallback: Vec3): Vec3 => {
  const magnitude = length(value);
  return magnitude > EPSILON ? mul(value, 1 / magnitude) : fallback;
};

const perpendicular = (direction: Vec3): Vec3 => {
  const reference: Vec3 = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  return normalize(cross(direction, reference), [1, 0, 0]);
};

export const solveTwoBoneIK = (input: TwoBoneIKInput): TwoBoneIKResult => {
  const upper = Math.max(EPSILON, Math.abs(input.upperLength));
  const lower = Math.max(EPSILON, Math.abs(input.lowerLength));
  const delta = sub(input.target, input.root);
  const rawDistance = length(delta);
  const maxReach = upper + lower;
  const minReach = Math.abs(upper - lower);
  const direction = normalize(delta, [1, 0, 0]);
  const solvedDistance = Math.max(minReach + EPSILON, Math.min(maxReach - EPSILON, rawDistance));

  const poleVector = sub(input.pole ?? [input.root[0], input.root[1] + 1, input.root[2]], input.root);
  const rawNormal = cross(direction, poleVector);
  const normal = length(rawNormal) > EPSILON ? normalize(rawNormal, [0, 0, 1]) : perpendicular(direction);
  const bend = normalize(cross(normal, direction), perpendicular(direction));

  const along = (upper * upper + solvedDistance * solvedDistance - lower * lower) / (2 * solvedDistance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const joint = add(add(input.root, mul(direction, along)), mul(bend, height));
  const end = add(input.root, mul(direction, solvedDistance));

  return {
    joint,
    end,
    reachable: rawDistance >= minReach && rawDistance <= maxReach,
  };
};
