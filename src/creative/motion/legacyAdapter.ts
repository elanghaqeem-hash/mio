import type { MioMotionProject, MotionKeyframe as LegacyKeyframe } from "../../types/creative";
import type { MotionDocument, MotionInterpolation, MotionKeyframe, MotionTrack } from "./model";

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

const legacyTrack = (project: MioMotionProject, layerId: string, property: string, fallback: number): MotionTrack<number> => {
  const source = project.tracks.find((track) => track.nodeId === layerId && track.property === property);
  return { id: source?.id ?? `track_${layerId}_${property}`, property, defaultValue: fallback, keyframes: source?.keyframes.map((key) => toKey(key, project.fps)) ?? [] };
};

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
          position: {
            id: `track_${layer.id}_position`,
            property: "position",
            defaultValue: [layer.x, layer.y] as const,
            keyframes: [],
          },
          scale: legacyTrack(project, layer.id, "scale", layer.scale),
          rotation: legacyTrack(project, layer.id, "rotation", layer.rotation),
          opacity: legacyTrack(project, layer.id, "opacity", layer.opacity),
        },
        tracks: [
          legacyTrack(project, layer.id, "x", layer.x),
          legacyTrack(project, layer.id, "y", layer.y),
        ],
      })),
    }],
  };
}
