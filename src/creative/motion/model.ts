export const MOTION_SCHEMA_VERSION = 1 as const;

export type MotionValue = number | readonly number[];

export type MotionInterpolation =
  | { type: "hold" }
  | { type: "linear" }
  | {
      type: "bezier";
      out: readonly [number, number];
      in: readonly [number, number];
    };

export interface MotionKeyframe<T extends MotionValue = MotionValue> {
  id: string;
  frame: number;
  value: T;
  interpolation: MotionInterpolation;
}

export interface MotionTrack<T extends MotionValue = MotionValue> {
  id: string;
  property: string;
  defaultValue: T;
  keyframes: readonly MotionKeyframe<T>[];
}

export interface MotionTransform {
  position: MotionTrack<readonly [number, number]>;
  scale: MotionTrack<readonly [number, number]>;
  rotation: MotionTrack<number>;
  opacity: MotionTrack<number>;
}

export type MotionLayerType =
  | "shape"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "null"
  | "precomp"
  | "adjustment"
  | "camera";

export interface MotionLayer {
  id: string;
  name: string;
  type: MotionLayerType;
  parentId?: string;
  inFrame: number;
  outFrame: number;
  enabled: boolean;
  locked?: boolean;
  transform: MotionTransform;
  tracks?: readonly MotionTrack[];
}

export interface MotionMarker { id: string; frame: number; label?: string; }

export interface MotionComposition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  workArea: readonly [number, number];
  markers?: readonly MotionMarker[];
  layers: readonly MotionLayer[];
}

export interface MotionDocument {
  schemaVersion: typeof MOTION_SCHEMA_VERSION;
  id: string;
  compositions: readonly MotionComposition[];
  activeCompositionId: string;
}
