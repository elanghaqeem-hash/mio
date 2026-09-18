import type { MotionDocument } from "./model";
import { migrateMotionDocument } from "./migrations";
import { validateMotionDocument } from "./validation";

export function serializeMotionDocument(document: MotionDocument): string {
  validateMotionDocument(document);
  return JSON.stringify(document);
}

export function deserializeMotionDocument(serialized: string): MotionDocument {
  return migrateMotionDocument(JSON.parse(serialized) as unknown);
}
