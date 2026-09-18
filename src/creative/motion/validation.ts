import { MOTION_SCHEMA_VERSION, type MotionDocument } from "./model";

export function validateMotionDocument(document: MotionDocument): void {
  if (document.schemaVersion !== MOTION_SCHEMA_VERSION) throw new Error("Unsupported motion schema");
  if (!document.id) throw new Error("Motion document id is required");
  const compositionIds = new Set<string>();
  for (const composition of document.compositions) {
    if (compositionIds.has(composition.id)) throw new Error(`Duplicate composition id: ${composition.id}`);
    compositionIds.add(composition.id);
    if (composition.width <= 0 || composition.height <= 0) throw new Error("Composition dimensions must be positive");
    if (composition.fps <= 0 || !Number.isFinite(composition.fps)) throw new Error("Composition FPS must be positive");
    if (!Number.isInteger(composition.durationFrames) || composition.durationFrames <= 0) throw new Error("Duration must use positive integer frames");
    const [workStart, workEnd] = composition.workArea;
    if (!Number.isInteger(workStart) || !Number.isInteger(workEnd) || workStart < 0 || workEnd < workStart || workEnd >= composition.durationFrames) {
      throw new Error(`Invalid composition work area: ${composition.id}`);
    }
    const markerIds = new Set<string>();
    for (const marker of composition.markers ?? []) {
      if (!marker.id || markerIds.has(marker.id)) throw new Error(`Invalid or duplicate marker id: ${marker.id}`);
      markerIds.add(marker.id);
      if (!Number.isInteger(marker.frame) || marker.frame < 0 || marker.frame >= composition.durationFrames) throw new Error(`Invalid marker frame: ${marker.id}`);
    }

    const layerIds = new Set(composition.layers.map((layer) => layer.id));
    if (layerIds.size !== composition.layers.length) throw new Error(`Duplicate layer id in composition: ${composition.id}`);
    for (const layer of composition.layers) {
      if (!Number.isInteger(layer.inFrame) || !Number.isInteger(layer.outFrame) || layer.inFrame < 0 || layer.outFrame >= composition.durationFrames || layer.inFrame > layer.outFrame) {
        throw new Error(`Invalid layer frame range: ${layer.id}`);
      }
      const tracks = [layer.transform.position, layer.transform.scale, layer.transform.rotation, layer.transform.opacity, ...(layer.tracks ?? [])];
      const trackIds = new Set<string>();
      for (const track of tracks) {
        if (!track.id || trackIds.has(track.id)) throw new Error(`Invalid or duplicate track id on layer ${layer.id}: ${track.id}`);
        trackIds.add(track.id);
        validateMotionValue(track.defaultValue, `track default ${track.id}`);
        const keyIds = new Set<string>();
        let vectorLength = Array.isArray(track.defaultValue) ? track.defaultValue.length : undefined;
        for (const key of track.keyframes) {
          if (!key.id || keyIds.has(key.id)) throw new Error(`Invalid or duplicate keyframe id: ${key.id}`);
          keyIds.add(key.id);
          if (!Number.isInteger(key.frame) || key.frame < 0 || key.frame >= composition.durationFrames) throw new Error(`Invalid keyframe frame: ${key.id}`);
          validateMotionValue(key.value, `keyframe ${key.id}`);
          if (Array.isArray(key.value)) {
            vectorLength ??= key.value.length;
            if (key.value.length !== vectorLength) throw new Error(`Inconsistent vector length on track: ${track.id}`);
          } else if (vectorLength !== undefined) throw new Error(`Mixed scalar/vector values on track: ${track.id}`);
          if (key.interpolation.type === "bezier") {
            validateBezierHandle(key.interpolation.out, key.id);
            validateBezierHandle(key.interpolation.in, key.id);
          } else if (key.interpolation.type !== "linear" && key.interpolation.type !== "hold") throw new Error(`Invalid interpolation on keyframe: ${key.id}`);
        }
      }
      if (layer.parentId && !layerIds.has(layer.parentId)) throw new Error(`Missing parent layer: ${layer.parentId}`);
      detectParentCycle(layer.id, composition.layers);
    }
  }
  if (!compositionIds.has(document.activeCompositionId)) throw new Error("Active composition does not exist");
}

function detectParentCycle(startId: string, layers: MotionDocument["compositions"][number]["layers"]): void {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const visited = new Set<string>();
  let current: string | undefined = startId;
  while (current) {
    if (visited.has(current)) throw new Error(`Parent cycle detected at layer: ${current}`);
    visited.add(current);
    current = byId.get(current)?.parentId;
  }
}

function validateMotionValue(value: number | readonly number[], context: string): void {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error(`Invalid motion value: ${context}`);
}
function validateBezierHandle(handle: readonly [number, number], keyId: string): void {
  if (!Array.isArray(handle) || handle.length !== 2 || handle.some((item) => !Number.isFinite(item))) throw new Error(`Invalid bezier handle: ${keyId}`);
  if (handle[0] < 0 || handle[0] > 1) throw new Error(`Bezier temporal x must be normalized: ${keyId}`);
}
