import type { MotionCommand, MotionTransaction } from "./commands";
import type { MotionComposition, MotionDocument, MotionLayer } from "./model";
import type { TimelineMarker } from "./timeline";

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

export interface MotionTimelineMetadata { markers: readonly TimelineMarker[] }

export const normalizeTimelineMarkers = (markers: readonly TimelineMarker[], durationFrames: number): TimelineMarker[] =>
  markers.map((marker) => ({ ...marker, frame: Math.max(0, Math.min(durationFrames - 1, Math.round(marker.frame))) }))
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
