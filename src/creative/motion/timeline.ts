export interface TimelineSelection {
  layerIds: readonly string[];
  keyframeIds: readonly string[];
}

export interface TimelineSnapTarget { frame: number; kind: "keyframe" | "marker" | "layer" | "workArea"; priority?: number }

export const toggleTimelineSelection = (current: readonly string[], id: string, additive: boolean): string[] =>
  additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id];

export function snapTimelineFrame(frame: number, targets: readonly TimelineSnapTarget[], thresholdFrames = 1): number {
  const candidates = targets
    .map((target) => ({ ...target, distance: Math.abs(target.frame - frame) }))
    .filter((target) => target.distance <= thresholdFrames)
    .sort((a, b) => a.distance - b.distance || (b.priority ?? 0) - (a.priority ?? 0) || a.frame - b.frame);
  return candidates[0]?.frame ?? Math.round(frame);
}

export function moveSelectedKeyframes<T extends { id: string; frame: number }>(
  keyframes: readonly T[], selectedIds: readonly string[], deltaFrames: number, minFrame = 0, maxFrame = Number.MAX_SAFE_INTEGER,
): T[] {
  const selected = new Set(selectedIds);
  const selectedKeys = keyframes.filter((key) => selected.has(key.id));
  if (!selectedKeys.length) return [...keyframes].sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
  const requested = Math.round(deltaFrames);
  const minSelected = Math.min(...selectedKeys.map((key) => key.frame));
  const maxSelected = Math.max(...selectedKeys.map((key) => key.frame));
  const boundedDelta = Math.max(minFrame - minSelected, Math.min(maxFrame - maxSelected, requested));
  const occupied = new Set(keyframes.filter((key) => !selected.has(key.id)).map((key) => key.frame));
  const collisionFree = (delta: number): boolean => selectedKeys.every((key) => !occupied.has(key.frame + delta));
  let safeDelta = boundedDelta;
  while (safeDelta !== 0 && !collisionFree(safeDelta)) safeDelta += safeDelta > 0 ? -1 : 1;
  return keyframes
    .map((key) => selected.has(key.id) ? { ...key, frame: key.frame + safeDelta } : key)
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
}

export interface TimelineMarker { id: string; frame: number; label?: string }

export const selectKeyframesInRange = <T extends { id: string; frame: number }>(keyframes: readonly T[], startFrame: number, endFrame: number): string[] => {
  const min = Math.min(startFrame, endFrame), max = Math.max(startFrame, endFrame);
  return keyframes.filter((key) => key.frame >= min && key.frame <= max).map((key) => key.id);
};

export const deleteSelectedKeyframes = <T extends { id: string }>(keyframes: readonly T[], selectedIds: readonly string[]): T[] => {
  const selected = new Set(selectedIds);
  return keyframes.filter((key) => !selected.has(key.id));
};

export interface KeyframeClipboardItem<T> { sourceId: string; offset: number; value: T }
export const copyKeyframes = <T extends { id: string; frame: number }>(keyframes: readonly T[], selectedIds: readonly string[]): KeyframeClipboardItem<Omit<T, "id" | "frame">>[] => {
  const selected = keyframes.filter((key) => selectedIds.includes(key.id)).sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
  const origin = selected[0]?.frame ?? 0;
  return selected.map(({ id, frame, ...value }) => ({ sourceId: id, offset: frame - origin, value }));
};

export const pasteKeyframes = <T extends { id: string; frame: number }>(
  keyframes: readonly T[], clipboard: readonly KeyframeClipboardItem<Omit<T, "id" | "frame">>[], targetFrame: number, idFactory: (sourceId: string, index: number) => string,
): T[] => {
  const pasted = clipboard.map((item, index) => ({ ...item.value, id: idFactory(item.sourceId, index), frame: Math.max(0, Math.round(targetFrame + item.offset)) } as T));
  const pastedFrames = new Set(pasted.map((key) => key.frame));
  return [...keyframes.filter((key) => !pastedFrames.has(key.frame)), ...pasted]
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
};

export const trimLayerRange = (inFrame: number, outFrame: number, edge: "in" | "out", frame: number): readonly [number, number] =>
  edge === "in" ? [Math.min(Math.round(frame), outFrame), outFrame] : [inFrame, Math.max(inFrame, Math.round(frame))];

export const setWorkAreaEdge = (workArea: readonly [number, number], edge: "start" | "end", frame: number, durationFrames: number): readonly [number, number] => {
  const bounded = Math.max(0, Math.min(durationFrames - 1, Math.round(frame)));
  return edge === "start" ? [Math.min(bounded, workArea[1]), workArea[1]] : [workArea[0], Math.max(workArea[0], bounded)];
};

export const upsertTimelineMarker = (markers: readonly TimelineMarker[], marker: TimelineMarker): TimelineMarker[] =>
  [...markers.filter((item) => item.id !== marker.id), { ...marker, frame: Math.max(0, Math.round(marker.frame)) }].sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
