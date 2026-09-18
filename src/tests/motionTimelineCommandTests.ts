import { MotionCommandBus } from "../creative/motion/commands";
import type { MotionDocument } from "../creative/motion/model";
import { setMotionMarkersCommand, setMotionWorkAreaCommand, timelineTransaction, trimMotionLayerCommand } from "../creative/motion/timelineCommands";

const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(`Motion timeline command test failed: ${message}`); };

const document = (): MotionDocument => ({
  schemaVersion: 1, id: "doc", activeCompositionId: "comp",
  compositions: [{ id: "comp", name: "Comp", width: 1920, height: 1080, fps: 30, durationFrames: 90, workArea: [0, 89], layers: [{
    id: "layer", name: "Layer", type: "text", inFrame: 0, outFrame: 89, enabled: true,
    transform: {
      position: { id: "p", property: "position", defaultValue: [0, 0], keyframes: [] },
      scale: { id: "s", property: "scale", defaultValue: [100, 100], keyframes: [] },
      rotation: { id: "r", property: "rotation", defaultValue: 0, keyframes: [] },
      opacity: { id: "o", property: "opacity", defaultValue: 100, keyframes: [] },
    },
  }] }],
});

export function runMotionTimelineCommandTests(): void {
  const bus = new MotionCommandBus(document());
  bus.execute(timelineTransaction("temporal", "Temporal edit", [
    setMotionWorkAreaCommand("comp", [10, 70]),
    trimMotionLayerCommand("comp", "layer", 12, 65),
    setMotionMarkersCommand("comp", [{ id: "m2", frame: 80, label: "B" }, { id: "m1", frame: 20, label: "A" }]),
  ]));
  let comp = bus.document.compositions[0];
  assert(comp.workArea[0] === 10 && comp.workArea[1] === 70, "work area command");
  assert(comp.layers[0].inFrame === 12 && comp.layers[0].outFrame === 65, "trim command");
  assert(comp.markers?.map(marker => marker.id).join(",") === "m1,m2", "marker normalization/sort");
  bus.undo(); comp = bus.document.compositions[0];
  assert(comp.workArea[0] === 0 && comp.layers[0].inFrame === 0 && !comp.markers?.length, "atomic undo");
  bus.redo(); comp = bus.document.compositions[0];
  assert(comp.workArea[0] === 10 && comp.layers[0].inFrame === 12 && comp.markers?.length === 2, "atomic redo");

  let rejected = false;
  try { bus.execute(timelineTransaction("invalid", "Invalid trim", [trimMotionLayerCommand("comp", "layer", 80, 20)])); } catch { rejected = true; }
  assert(rejected, "invalid transaction rejected by document validation");
  assert(bus.document.compositions[0].layers[0].inFrame === 12, "rejected transaction does not mutate document");
}
