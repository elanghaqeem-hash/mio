import type { MioMotionProject, MotionKeyframe as LegacyKeyframe } from "../../types/creative";
import type { MotionDocument, MotionInterpolation, MotionKeyframe, MotionTrack } from "./model";
import { evaluateTrack } from "./evaluator";

const toInterpolation = (key: LegacyKeyframe): MotionInterpolation => {
  if (key.interpolation === "step") return { type: "hold" };
  if (key.interpolation === "linear") return { type: "linear" };
  if (key.interpolation === "easeIn") return { type: "bezier", out: [0.42, 0], in: [1, 1] };
  if (key.interpolation === "easeOut") return { type: "bezier", out: [0, 0], in: [0.58, 1] };
  return { type: "bezier", out: [0.42, 0], in: [0.58, 1] };
};

const toKey = (key: LegacyKeyframe, fps: number): MotionKeyframe<number> => ({
  id: key.id,
  frame: Math.round(key.time * fps),
  value: key.value,
  interpolation: toInterpolation(key),
});

export const legacyTrackToV2 = (project: MioMotionProject, layerId: string, property: string, fallback: number): MotionTrack<number> => {
  const source = project.tracks.find((track) => track.nodeId === layerId && track.property === property);
  return { id: source?.id ?? `track_${layerId}_${property}`, property, defaultValue: fallback, keyframes: source?.keyframes.map((key) => toKey(key, project.fps)) ?? [] };
};

export function mergeLegacyPositionTrack(project: MioMotionProject, layerId: string, fallbackX: number, fallbackY: number): MotionTrack<readonly [number, number]> {
  const x = legacyTrackToV2(project, layerId, "x", fallbackX);
  const y = legacyTrackToV2(project, layerId, "y", fallbackY);
  const frames = [...new Set([...x.keyframes.map((key) => key.frame), ...y.keyframes.map((key) => key.frame)])].sort((a, b) => a - b);
  const exactAt = (track: MotionTrack<number>, frame: number) => track.keyframes.find((key) => key.frame === frame);
  const sample = (track: MotionTrack<number>, frame: number): number => evaluateTrack(track, frame);
  return {
    id: `track_${layerId}_position`,
    property: "position",
    defaultValue: [fallbackX, fallbackY] as const,
    keyframes: frames.map((frame) => {
      const exactX = exactAt(x, frame);
      const exactY = exactAt(y, frame);
      // Deterministic merge policy: X interpolation wins when both axes key the same frame;
      // otherwise the axis that owns the exact key defines temporal interpolation.
      const source = exactX ?? exactY;
      return { id: `key_${layerId}_position_${frame}`, frame, value: [sample(x, frame), sample(y, frame)] as const, interpolation: source?.interpolation ?? { type: "linear" } };
    }),
  };
}

export function legacyMotionProjectToV2(project: MioMotionProject, documentId = "motion-document", compositionId = "main"): MotionDocument {
  const durationFrames = Math.max(1, Math.round(project.duration * project.fps));
  return {
    schemaVersion: 1,
    id: documentId,
    activeCompositionId: compositionId,
    compositions: [{
      id: compositionId,
      name: "Main Composition",
      width: project.width,
      height: project.height,
      fps: project.fps,
      durationFrames,
      workArea: [0, durationFrames - 1],
      layers: project.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        inFrame: 0,
        outFrame: durationFrames - 1,
        enabled: layer.visible,
        locked: layer.locked,
        transform: {
          position: mergeLegacyPositionTrack(project, layer.id, layer.x, layer.y),
          scale: legacyTrackToV2(project, layer.id, "scale", layer.scale),
          rotation: legacyTrackToV2(project, layer.id, "rotation", layer.rotation),
          opacity: legacyTrackToV2(project, layer.id, "opacity", layer.opacity),
        },
        tracks: [
          legacyTrackToV2(project, layer.id, "x", layer.x),
          legacyTrackToV2(project, layer.id, "y", layer.y),
        ],
      })),
    }],
  };
}
