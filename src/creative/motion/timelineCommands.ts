import type { MotionCommand, MotionTransaction } from "./commands";
import type { MotionComposition, MotionDocument, MotionInterpolation, MotionKeyframe, MotionLayer, MotionMarker, MotionTrack } from "./model";
import { moveSelectedKeyframes, type TimelineMarker } from "./timeline";

const updateComposition = (document: MotionDocument, compositionId: string, update: (composition: MotionComposition) => MotionComposition): MotionDocument => ({
  ...document,
  compositions: document.compositions.map((composition) => composition.id === compositionId ? update(composition) : composition),
});

export const setMotionWorkAreaCommand = (compositionId: string, workArea: readonly [number, number]): MotionCommand => ({
  id: `workarea:${compositionId}`, label: "Set work area",
  apply: (document) => updateComposition(document, compositionId, (composition) => ({ ...composition, workArea })),
});

export const trimMotionLayerCommand = (compositionId: string, layerId: string, inFrame: number, outFrame: number): MotionCommand => ({
  id: `trim:${layerId}`, label: "Trim layer",
  apply: (document) => updateComposition(document, compositionId, (composition) => ({
    ...composition,
    layers: composition.layers.map((layer): MotionLayer => layer.id === layerId ? { ...layer, inFrame, outFrame } : layer),
  })),
});

export const timelineTransaction = (id: string, label: string, commands: readonly MotionCommand[]): MotionTransaction => ({ id, label, commands });

export const setMotionMarkersCommand = (compositionId: string, markers: readonly MotionMarker[]): MotionCommand => ({
  id: `markers:${compositionId}`, label: "Set timeline markers",
  apply: (document) => updateComposition(document, compositionId, (composition) => ({ ...composition, markers: normalizeTimelineMarkers(markers, composition.durationFrames) })),
});

export interface MotionTimelineMetadata { markers: readonly TimelineMarker[] }

export const normalizeTimelineMarkers = (markers: readonly TimelineMarker[], durationFrames: number): TimelineMarker[] =>
  markers.map((marker) => ({ ...marker, frame: Math.max(0, Math.min(durationFrames - 1, Math.round(marker.frame))) }))
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));

export const updateMotionTrack = (
  compositionId: string, layerId: string, trackId: string,
  update: (track: MotionTrack, composition: MotionComposition) => MotionTrack,
): MotionCommand => ({
  id: `track:${layerId}:${trackId}`, label: "Update motion track",
  apply: (document) => updateComposition(document, compositionId, (composition) => ({
    ...composition,
    layers: composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const replace = (track: MotionTrack): MotionTrack => track.id === trackId ? update(track, composition) : track;
      return {
        ...layer,
        transform: {
          ...layer.transform,
          position: replace(layer.transform.position) as MotionLayer["transform"]["position"],
          scale: replace(layer.transform.scale) as MotionLayer["transform"]["scale"],
          rotation: replace(layer.transform.rotation) as MotionLayer["transform"]["rotation"],
          opacity: replace(layer.transform.opacity) as MotionLayer["transform"]["opacity"],
        },
        tracks: layer.tracks?.map(replace),
      };
    }),
  })),
});

export const upsertMotionKeyframeCommand = (
  compositionId: string, layerId: string, trackId: string, keyframe: MotionKeyframe,
): MotionCommand => updateMotionTrack(compositionId, layerId, trackId, (track) => ({
  ...track,
  keyframes: [...track.keyframes.filter((key) => key.id !== keyframe.id && key.frame !== keyframe.frame), keyframe]
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id)),
}));

export const moveMotionKeyframeCommand = (
  compositionId: string, layerId: string, trackId: string, keyframeId: string, frame: number,
): MotionCommand => updateMotionTrack(compositionId, layerId, trackId, (track, composition) => {
  const key = track.keyframes.find((item) => item.id === keyframeId);
  if (!key) throw new Error(`Keyframe not found: ${keyframeId}`);
  return { ...track, keyframes: moveSelectedKeyframes(track.keyframes, [keyframeId], Math.round(frame) - key.frame, 0, composition.durationFrames - 1) };
});

export const deleteMotionKeyframeCommand = (
  compositionId: string, layerId: string, trackId: string, keyframeId: string,
): MotionCommand => updateMotionTrack(compositionId, layerId, trackId, (track) => ({
  ...track, keyframes: track.keyframes.filter((key) => key.id !== keyframeId),
}));

export const setMotionKeyframeInterpolationCommand = (
  compositionId: string, layerId: string, trackId: string, keyframeId: string, interpolation: MotionInterpolation,
): MotionCommand => updateMotionTrack(compositionId, layerId, trackId, (track) => ({
  ...track, keyframes: track.keyframes.map((key) => key.id === keyframeId ? { ...key, interpolation } : key),
}));

export const setMotionBezierHandlesCommand = (
  compositionId: string, layerId: string, trackId: string, keyframeId: string,
  outHandle: readonly [number, number], inHandle: readonly [number, number],
): MotionCommand => setMotionKeyframeInterpolationCommand(compositionId, layerId, trackId, keyframeId, {
  type: "bezier",
  out: [Math.max(0, Math.min(1, outHandle[0])), outHandle[1]],
  in: [Math.max(0, Math.min(1, inHandle[0])), inHandle[1]],
});

export const moveMotionKeyframesCommand = (
  compositionId: string, layerId: string, trackId: string,
  keyframeIds: readonly string[], deltaFrames: number, durationFrames: number,
): MotionCommand => updateMotionTrack(compositionId, layerId, trackId, (track) => ({
  ...track,
  keyframes: moveSelectedKeyframes(track.keyframes, keyframeIds, deltaFrames, 0, durationFrames - 1),
}));

export const updateMotionTransformDefaultsCommand = (
  compositionId: string, layerId: string,
  changes: Partial<{ position: readonly [number, number]; scale: readonly [number, number]; rotation: number; opacity: number }>,
): MotionCommand => ({
  id: `transform-defaults:${layerId}`, label: "Update transform",
  apply: (document) => updateComposition(document, compositionId, (composition) => ({
    ...composition,
    layers: composition.layers.map((layer) => layer.id !== layerId ? layer : ({
      ...layer,
      transform: {
        ...layer.transform,
        position: changes.position ? { ...layer.transform.position, defaultValue: changes.position } : layer.transform.position,
        scale: changes.scale ? { ...layer.transform.scale, defaultValue: changes.scale } : layer.transform.scale,
        rotation: changes.rotation === undefined ? layer.transform.rotation : { ...layer.transform.rotation, defaultValue: changes.rotation },
        opacity: changes.opacity === undefined ? layer.transform.opacity : { ...layer.transform.opacity, defaultValue: changes.opacity },
      },
    })),
  })),
});
