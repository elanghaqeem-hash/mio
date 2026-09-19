import { evaluateTrack } from "../creative/motion/evaluator";
import { legacyMotionProjectToV2, applyV2ToLegacyMotionProject } from "../creative/motion/legacyAdapter";
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

  run("asynchronous XY merge preserves easing ownership and evaluated axis", () => {
    const asyncEaseProject: MioMotionProject = {
      ...project,
      tracks: [
        { id: "tx", nodeId: "title", property: "x", keyframes: [{ id: "x0", time: 0, value: 0, interpolation: "linear" }, { id: "x30", time: 1, value: 300, interpolation: "easeOut" }] },
        { id: "ty", nodeId: "title", property: "y", keyframes: [{ id: "y0", time: 0, value: 0, interpolation: "linear" }, { id: "y15", time: .5, value: 100, interpolation: "easeIn" }, { id: "y30", time: 1, value: 200, interpolation: "linear" }] },
      ],
    };
    const position = legacyMotionProjectToV2(asyncEaseProject).compositions[0].layers[0].transform.position;
    const at15 = position.keyframes.find((key) => key.frame === 15)!;
    assert(Math.abs(at15.value[0] - 150) < .001, "X interpolation at Y-owned union frame changed");
    assert(at15.interpolation.type === "bezier", "Y-owned easing was not preserved");
    if (at15.interpolation.type === "bezier") assert(at15.interpolation.out[0] === .42, "Y easeIn ownership changed");
    const at30 = position.keyframes.find((key) => key.frame === 30)!;
    assert(at30.interpolation.type === "bezier", "same-frame X priority was not preserved");
    if (at30.interpolation.type === "bezier") assert(at30.interpolation.out[0] === 0, "same-frame interpolation priority must prefer X");
  });

  run("V2 edits project through reverse legacy projection", () => {
    const v2 = legacyMotionProjectToV2(project);
    const edited = structuredClone(v2);
    const layer = edited.compositions[0].layers[0];
    layer.transform.position = {
      ...layer.transform.position,
      keyframes: [{ id: "key_x", frame: 15, value: [123, 456], interpolation: { type: "linear" } }],
    };
    const projected = applyV2ToLegacyMotionProject(project, edited);
    const x = projected.tracks.find(track => track.nodeId === layer.id && track.property === "x")?.keyframes[0];
    const y = projected.tracks.find(track => track.nodeId === layer.id && track.property === "y")?.keyframes[0];
    assert(x?.time === 0.5 && x.value === 123, "X reverse projection");
    assert(y?.time === 0.5 && y.value === 456, "Y reverse projection");
  });

  for (const result of results) console.log(`${result.passed ? "✓" : "✗"} [${result.passed ? "PASS" : "FAIL"}] ${result.name}${result.error ? ` — ${result.error}` : ""}`);
  return { passed: results.filter((result) => result.passed).length, total: results.length };
}
