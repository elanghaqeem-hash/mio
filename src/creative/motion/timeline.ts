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
  return keyframes
    .map((key) => selected.has(key.id) ? { ...key, frame: Math.max(minFrame, Math.min(maxFrame, key.frame + Math.round(deltaFrames))) } : key)
    .sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id));
}
