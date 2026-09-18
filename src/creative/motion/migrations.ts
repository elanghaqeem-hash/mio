import { MOTION_SCHEMA_VERSION, type MotionDocument } from "./model";
import { validateMotionDocument } from "./validation";

type UnknownRecord = Record<string, unknown>;

export function migrateMotionDocument(input: unknown): MotionDocument {
  if (!input || typeof input !== "object") throw new Error("Invalid motion document payload");
  const record = input as UnknownRecord;
  const version = record.schemaVersion;
  if (version !== MOTION_SCHEMA_VERSION) {
    throw new Error(`No motion schema migration path from version ${String(version)} to ${MOTION_SCHEMA_VERSION}`);
  }
  assertMotionDocumentShape(record);
  const document = record as unknown as MotionDocument;
  validateMotionDocument(document);
  return document;
}

function assertMotionDocumentShape(record: UnknownRecord): void {
  if (typeof record.id !== "string" || !record.id) throw new Error("Invalid motion document id");
  if (typeof record.activeCompositionId !== "string") throw new Error("Invalid active composition id");
  if (!Array.isArray(record.compositions)) throw new Error("Motion compositions must be an array");
  for (const raw of record.compositions) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid motion composition");
    const composition = raw as UnknownRecord;
    if (typeof composition.id !== "string" || typeof composition.name !== "string") throw new Error("Invalid motion composition identity");
    for (const field of ["width","height","fps","durationFrames"] as const) if (typeof composition[field] !== "number") throw new Error(`Invalid composition field: ${field}`);
    if (!Array.isArray(composition.workArea) || composition.workArea.length !== 2) throw new Error("Invalid composition work area");
    if (!Array.isArray(composition.layers)) throw new Error("Motion layers must be an array");
    if (composition.markers !== undefined && !Array.isArray(composition.markers)) throw new Error("Motion markers must be an array");
    for (const rawLayer of composition.layers) {
      if (!rawLayer || typeof rawLayer !== "object") throw new Error("Invalid motion layer");
      const layer = rawLayer as UnknownRecord;
      if (typeof layer.id !== "string" || typeof layer.name !== "string" || typeof layer.type !== "string") throw new Error("Invalid motion layer identity");
      if (typeof layer.inFrame !== "number" || typeof layer.outFrame !== "number") throw new Error("Invalid motion layer range");
      if (!layer.transform || typeof layer.transform !== "object") throw new Error("Invalid motion layer transform");
    }
  }
}
