import type { MotionInterpolation, MotionKeyframe, MotionTrack, MotionValue } from "./model";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function bezierProgress(t: number, interpolation: Extract<MotionInterpolation, { type: "bezier" }>): number {
  const x1 = clamp01(interpolation.out[0]);
  const y1 = interpolation.out[1];
  const x2 = clamp01(interpolation.in[0]);
  const y2 = interpolation.in[1];

  let lo = 0;
  let hi = 1;
  let parameter = t;
  for (let i = 0; i < 18; i += 1) {
    parameter = (lo + hi) / 2;
    const x = cubic(0, x1, x2, 1, parameter);
    if (x < t) lo = parameter;
    else hi = parameter;
  }
  return cubic(0, y1, y2, 1, parameter);
}

function mix<T extends MotionValue>(a: T, b: T, t: number): T {
  if (typeof a === "number" && typeof b === "number") return (a + (b - a) * t) as T;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((value, index) => value + (b[index] - value) * t) as unknown as T;
  }
  throw new Error("Motion track values have incompatible shapes");
}

function sorted<T extends MotionValue>(keyframes: readonly MotionKeyframe<T>[]): MotionKeyframe<T>[] {
  return [...keyframes].sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
}

export function evaluateTrack<T extends MotionValue>(track: MotionTrack<T>, frame: number): T {
  if (!Number.isFinite(frame)) throw new Error("Frame must be finite");
  const keys = sorted(track.keyframes);
  if (keys.length === 0) return track.defaultValue;
  if (frame <= keys[0].frame) return keys[0].value;
  if (frame >= keys[keys.length - 1].frame) return keys[keys.length - 1].value;

  const rightIndex = keys.findIndex((key) => key.frame > frame);
  const left = keys[rightIndex - 1];
  const right = keys[rightIndex];
  if (left.interpolation.type === "hold") return left.value;

  const span = right.frame - left.frame;
  if (span <= 0) return right.value;
  let progress = clamp01((frame - left.frame) / span);
  if (left.interpolation.type === "bezier") progress = bezierProgress(progress, left.interpolation);
  return mix(left.value, right.value, progress);
}
