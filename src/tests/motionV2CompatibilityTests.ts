import { evaluateTrack } from "../creative/motion/evaluator";
import { legacyMotionProjectToV2 } from "../creative/motion/legacyAdapter";
import { evaluateMotionKeyframes } from "../creative/MotionWorkspace";
import type { MioMotionProject } from "../types/creative";

const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };

export async function runMotionV2CompatibilityTests(): Promise<{ passed: number; total: number }> {
  const results: { name: string; passed: boolean; error?: string }[] = [];
  const run = (name: string, fn: () => void) => {
    try { fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) }); }
  };

  const project: MioMotionProject = {
    width: 1920, height: 1080, backgroundColor: "#000", duration: 2, fps: 30, currentTime: 0, loop: true,
    layers: [{ id: "title", name: "Title", type: "text", visible: true, locked: false, x: 100, y: 200, width: 400, height: 80, scale: 1, rotation: 0, opacity: 1, fill: "#fff", text: "Mio" }],
    tracks: [
      { id: "tx", nodeId: "title", property: "x", keyframes: [{ id: "x0", time: 0, value: 100, interpolation: "linear" }, { id: "x1", time: 1, value: 500, interpolation: "linear" }] },
      { id: "ty", nodeId: "title", property: "y", keyframes: [{ id: "y0", time: 0, value: 200, interpolation: "linear" }, { id: "y1", time: 1, value: 400, interpolation: "linear" }] },
    ],
  };

  run("legacy project preserves composition dimensions and frame duration", () => {
    const v2 = legacyMotionProjectToV2(project);
    const comp = v2.compositions[0];
    assert(comp.width === 1920 && comp.height === 1080, "dimensions changed");
    assert(comp.durationFrames === 60 && comp.fps === 30, "duration/fps conversion changed");
  });

  run("legacy XY tracks become one vector position track", () => {
    const position = legacyMotionProjectToV2(project).compositions[0].layers[0].transform.position;
    assert(position.keyframes.length === 2, "position keyframe union is incorrect");
    const midpoint = evaluateTrack(position, 15);
    assert(Math.abs(midpoint[0] - 300) < .001 && Math.abs(midpoint[1] - 300) < .001, "vector position interpolation mismatch");
  });

  run("linear legacy evaluator and V2 evaluator preserve X parity", () => {
    const legacy = evaluateMotionKeyframes(project.tracks[0].keyframes, .5, 100);
    const v2 = legacyMotionProjectToV2(project).compositions[0].layers[0].transform.position;
    assert(Math.abs(evaluateTrack(v2, 15)[0] - legacy) < .001, "legacy/V2 X parity mismatch");
  });

  run("asynchronous legacy XY keys interpolate the missing axis", () => {
    const asyncProject: MioMotionProject = {
      ...project,
      tracks: [
        { id: "tx", nodeId: "title", property: "x", keyframes: [{ id: "x0", time: 0, value: 0, interpolation: "linear" }, { id: "x1", time: 1, value: 300, interpolation: "linear" }] },
        { id: "ty", nodeId: "title", property: "y", keyframes: [{ id: "y0", time: 0, value: 0, interpolation: "linear" }, { id: "y15", time: .5, value: 100, interpolation: "linear" }, { id: "y30", time: 1, value: 200, interpolation: "linear" }] },
      ],
    };
    const position = legacyMotionProjectToV2(asyncProject).compositions[0].layers[0].transform.position;
    const at15 = position.keyframes.find((key) => key.frame === 15);
    assert(!!at15, "union frame 15 missing");
    assert(Math.abs(at15!.value[0] - 150) < .001 && Math.abs(at15!.value[1] - 100) < .001, "missing X axis was not interpolated at Y-only key");
  });

  for (const result of results) console.log(`${result.passed ? "✓" : "✗"} [${result.passed ? "PASS" : "FAIL"}] ${result.name}${result.error ? ` — ${result.error}` : ""}`);
  return { passed: results.filter((result) => result.passed).length, total: results.length };
}
