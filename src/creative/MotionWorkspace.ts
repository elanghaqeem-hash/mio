import type { MotionKeyframe } from '../types/creative';

export const snapMotionTime = (time: number, fps: number): number => Number((Math.round(time * fps) / fps).toFixed(3));

const eased = (amount: number, interpolation: MotionKeyframe['interpolation']): number => {
  if (interpolation === 'step') return 0;
  if (interpolation === 'easeIn') return amount * amount;
  if (interpolation === 'easeOut') return 1 - (1 - amount) ** 2;
  if (interpolation === 'easeInOut') return amount < .5 ? 2 * amount * amount : 1 - ((-2 * amount + 2) ** 2) / 2;
  return amount;
};

export const evaluateMotionKeyframes = (keyframes: MotionKeyframe[], time: number, fallback: number): number => {
  if (!keyframes.length) return fallback;
  const ordered = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= ordered[0].time) return ordered[0].value;
  if (time >= ordered.at(-1)!.time) return ordered.at(-1)!.value;
  const rightIndex = ordered.findIndex((keyframe) => keyframe.time >= time);
  const left = ordered[rightIndex - 1]; const right = ordered[rightIndex];
  const amount = (time - left.time) / Math.max(.0001, right.time - left.time);
  return left.value + (right.value - left.value) * eased(amount, left.interpolation);
};
