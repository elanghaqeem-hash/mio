import type { DrawingPoint } from '../../types/creative';
import type { DrawingInputSample } from './DrawingInput';

export interface DrawingStrokeProcessorOptions {
  distanceEpsilon?: number;
  pressureEpsilon?: number;
}

export const processDrawingSamples = (samples: readonly DrawingInputSample[], options: DrawingStrokeProcessorOptions = {}): DrawingPoint[] => {
  const distanceEpsilon = Math.max(0, options.distanceEpsilon ?? 0.01);
  const pressureEpsilon = Math.max(0, options.pressureEpsilon ?? 0.001);
  const points: DrawingPoint[] = [];
  let previous: DrawingInputSample | undefined;
  for (const sample of samples) {
    if (previous) {
      const distance = Math.hypot(sample.x - previous.x, sample.y - previous.y);
      const pressureDelta = Math.abs(sample.pressure - previous.pressure);
      if (distance <= distanceEpsilon && pressureDelta <= pressureEpsilon) continue;
    }
    points.push({ x: sample.x, y: sample.y, pressure: sample.pressure });
    previous = sample;
  }
  return points;
};
