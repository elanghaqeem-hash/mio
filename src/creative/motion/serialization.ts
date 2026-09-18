import type { MotionDocument } from "./model";
import { validateMotionDocument } from "./validation";

export function serializeMotionDocument(document: MotionDocument): string {
  validateMotionDocument(document);
  return JSON.stringify(document);
}

export function deserializeMotionDocument(serialized: string): MotionDocument {
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid motion document");
  const document = parsed as MotionDocument;
  validateMotionDocument(document);
  return document;
}
