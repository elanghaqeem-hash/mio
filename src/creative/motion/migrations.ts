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
  const document = record as unknown as MotionDocument;
  validateMotionDocument(document);
  return document;
}
