import type { PoseAxis } from './PoseOperations';
import type { PoseTool } from './PoseEditSession';

export interface PointerPoint { x: number; y: number; }
export interface TransformGizmoDrag {
  tool: PoseTool;
  axis: PoseAxis;
  origin: PointerPoint;
  pixelsPerUnit: number;
  radiansPerPixel: number;
}

const assertPoint = (point: PointerPoint) => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Pointer coordinates must be finite');
};

export const beginTransformGizmoDrag = (
  tool: PoseTool,
  axis: PoseAxis,
  origin: PointerPoint,
  pixelsPerUnit = 80,
  radiansPerPixel = Math.PI / 360,
): TransformGizmoDrag => {
  assertPoint(origin);
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) throw new Error('Gizmo pixelsPerUnit must be positive and finite');
  if (!Number.isFinite(radiansPerPixel) || radiansPerPixel <= 0) throw new Error('Gizmo radiansPerPixel must be positive and finite');
  return { tool, axis, origin, pixelsPerUnit, radiansPerPixel };
};

const axisPixels = (axis: PoseAxis, dx: number, dy: number): number => {
  if (axis === 'x') return dx;
  if (axis === 'y') return -dy;
  return (dx - dy) / Math.SQRT2;
};

export const transformGizmoDelta = (drag: TransformGizmoDrag, pointer: PointerPoint): number => {
  assertPoint(pointer);
  const dx = pointer.x - drag.origin.x;
  const dy = pointer.y - drag.origin.y;
  const pixels = axisPixels(drag.axis, dx, dy);
  return drag.tool === 'ROTATE' ? pixels * drag.radiansPerPixel : pixels / drag.pixelsPerUnit;
};

export const snapTransformDelta = (
  value: number,
  step: number | undefined,
): number => {
  if (!Number.isFinite(value)) throw new Error('Transform delta must be finite');
  if (step === undefined) return value;
  if (!Number.isFinite(step) || step <= 0) throw new Error('Snap step must be positive and finite');
  return Math.round(value / step) * step;
};
