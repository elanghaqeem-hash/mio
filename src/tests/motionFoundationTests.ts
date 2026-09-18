import { evaluateTrack } from "../creative/motion/evaluator";
import { deserializeMotionDocument, serializeMotionDocument } from "../creative/motion/serialization";
import type { MotionDocument, MotionTrack } from "../creative/motion/model";
import { validateMotionDocument } from "../creative/motion/validation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Motion foundation test failed: ${message}`);
}

export function runMotionFoundationTests(): void {
  const track: MotionTrack<number> = {
    id: "opacity",
    property: "opacity",
    defaultValue: 100,
    keyframes: [
      { id: "b", frame: 10, value: 100, interpolation: { type: "linear" } },
      { id: "a", frame: 0, value: 0, interpolation: { type: "linear" } },
    ],
  };
  assert(evaluateTrack(track, 5) === 50, "linear interpolation");
  assert(evaluateTrack(track, -1) === 0, "left clamp");
  assert(evaluateTrack(track, 20) === 100, "right clamp");

  const hold: MotionTrack<number> = {
    ...track,
    keyframes: [
      { id: "a", frame: 0, value: 10, interpolation: { type: "hold" } },
      { id: "b", frame: 10, value: 90, interpolation: { type: "linear" } },
    ],
  };
  assert(evaluateTrack(hold, 9) === 10, "hold interpolation");

  const emptyTransform = {
    position: { id: "p", property: "position", defaultValue: [0, 0] as const, keyframes: [] },
    scale: { id: "s", property: "scale", defaultValue: [100, 100] as const, keyframes: [] },
    rotation: { id: "r", property: "rotation", defaultValue: 0, keyframes: [] },
    opacity: { id: "o", property: "opacity", defaultValue: 100, keyframes: [] },
  };
  const document: MotionDocument = {
    schemaVersion: 1,
    id: "doc",
    activeCompositionId: "comp",
    compositions: [{
      id: "comp",
      name: "Test",
      width: 1920,
      height: 1080,
      fps: 30,
      durationFrames: 300,
      workArea: [0, 299],
      layers: [{
        id: "title",
        name: "Title",
        type: "text",
        inFrame: 0,
        outFrame: 299,
        enabled: true,
        transform: emptyTransform,
      }],
    }],
  };
  validateMotionDocument(document);
  const roundTrip = deserializeMotionDocument(serializeMotionDocument(document));
  assert(roundTrip.compositions[0].width === 1920, "serialization round trip");

  const cyclic: MotionDocument = JSON.parse(JSON.stringify(document));
  const layer = cyclic.compositions[0].layers[0] as { parentId?: string };
  layer.parentId = "title";
  let rejected = false;
  try { validateMotionDocument(cyclic); } catch { rejected = true; }
  assert(rejected, "parent cycle rejection");
}
