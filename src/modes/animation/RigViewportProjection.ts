import type { RigViewportModel } from './RigViewportModel';

export type ViewportPoint = [number, number];
export type WorldPoint = [number, number, number];

export interface RigViewportProjectionOptions {
  width: number;
  height: number;
  pixelsPerUnit?: number;
  center?: ViewportPoint;
  depthSkew?: ViewportPoint;
}

export interface ProjectedBoneGizmo {
  id: string;
  name: string;
  head: ViewportPoint;
  tail: ViewportPoint;
  selected: boolean;
  ikFk: 'IK' | 'FK';
}

export interface ProjectedRigViewportModel {
  bones: ProjectedBoneGizmo[];
  selectedBoneId?: string;
}

const finitePositive = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number`);
  return value;
};

export const createRigViewportProjector = (options: RigViewportProjectionOptions) => {
  const width = finitePositive(options.width, 'Viewport width');
  const height = finitePositive(options.height, 'Viewport height');
  const pixelsPerUnit = finitePositive(options.pixelsPerUnit ?? 56, 'Viewport scale');
  const center = options.center ?? [width / 2, height * 0.72];
  const depthSkew = options.depthSkew ?? [0.28, -0.14];

  if (![...center, ...depthSkew].every(Number.isFinite)) throw new Error('Viewport projection values must be finite');

  return ([x, y, z]: WorldPoint): ViewportPoint => [
    center[0] + (x + z * depthSkew[0]) * pixelsPerUnit,
    center[1] - (y + z * depthSkew[1]) * pixelsPerUnit,
  ];
};

export const projectRigViewportModel = (
  model: RigViewportModel,
  options: RigViewportProjectionOptions,
): ProjectedRigViewportModel => {
  const project = createRigViewportProjector(options);
  return {
    selectedBoneId: model.selectedBoneId,
    bones: model.bones.map(bone => ({
      id: bone.id,
      name: bone.name,
      head: project(bone.head),
      tail: project(bone.tail),
      selected: bone.selected,
      ikFk: bone.ikFk,
    })),
  };
};

export const pickProjectedBone = (
  model: ProjectedRigViewportModel,
  point: ViewportPoint,
  threshold = 14,
): string | undefined => {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Bone pick threshold must be a finite non-negative number');
  let best: { id: string; distance: number } | undefined;
  for (const bone of model.bones) {
    const vx = bone.tail[0] - bone.head[0];
    const vy = bone.tail[1] - bone.head[1];
    const wx = point[0] - bone.head[0];
    const wy = point[1] - bone.head[1];
    const denominator = vx * vx + vy * vy;
    const t = denominator > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / denominator)) : 0;
    const dx = point[0] - (bone.head[0] + vx * t);
    const dy = point[1] - (bone.head[1] + vy * t);
    const distance = Math.hypot(dx, dy);
    if (distance <= threshold && (!best || distance < best.distance)) best = { id: bone.id, distance };
  }
  return best?.id;
};
