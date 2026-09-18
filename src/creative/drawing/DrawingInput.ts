export type DrawingPointerType = 'mouse' | 'pen' | 'touch';

export interface DrawingInputSample {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
  pointerId: number;
  pointerType: DrawingPointerType;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
}

export interface DrawingInputOptions {
  mousePressure?: number;
  touchPressure?: number;
}

const finite = (value: number, name: string): number => {
  if (!Number.isFinite(value)) throw new Error(`DRAWING_INPUT_INVALID_${name.toUpperCase()}`);
  return value;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const normalizeDrawingInput = (sample: DrawingInputSample, options: DrawingInputOptions = {}): DrawingInputSample => {
  const pointerId = finite(sample.pointerId, 'pointer_id');
  const timestamp = finite(sample.timestamp, 'timestamp');
  const rawPressure = sample.pointerType === 'mouse'
    ? (sample.pressure > 0 ? sample.pressure : options.mousePressure ?? 1)
    : sample.pointerType === 'touch' && sample.pressure <= 0
      ? options.touchPressure ?? 1
      : sample.pressure;
  return {
    ...sample,
    x: finite(sample.x, 'x'),
    y: finite(sample.y, 'y'),
    pressure: clamp(finite(rawPressure, 'pressure'), 0, 1),
    timestamp,
    pointerId,
    ...(sample.tiltX === undefined ? {} : { tiltX: clamp(finite(sample.tiltX, 'tilt_x'), -90, 90) }),
    ...(sample.tiltY === undefined ? {} : { tiltY: clamp(finite(sample.tiltY, 'tilt_y'), -90, 90) }),
    ...(sample.twist === undefined ? {} : { twist: clamp(finite(sample.twist, 'twist'), 0, 359) }),
  };
};
