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

    const layerIds = new Set(composition.layers.map((layer) => layer.id));
    if (layerIds.size !== composition.layers.length) throw new Error(`Duplicate layer id in composition: ${composition.id}`);
    for (const layer of composition.layers) {
      if (!Number.isInteger(layer.inFrame) || !Number.isInteger(layer.outFrame) || layer.inFrame > layer.outFrame) {
        throw new Error(`Invalid layer frame range: ${layer.id}`);
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
