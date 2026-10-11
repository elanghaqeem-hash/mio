import { applyMusicAutomationStep, planMusicAutomationStep } from '../creative/AudioWorkspace';
import type { MusicAutomationLane } from '../types/creative';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const lane = (interpolation: MusicAutomationLane['interpolation']): MusicAutomationLane => ({
  id: 'lane', trackId: 't', parameter: 'volume', interpolation,
  points: [{ id: 'p0', step: 0, value: 0 }, { id: 'p1', step: 4, value: 1 }],
} as MusicAutomationLane);
const recorder = () => {
  const calls: Array<{ kind: 'set' | 'ramp'; value: number; time: number }> = [];
  return { calls, param: { setValueAtTime: (value: number, time: number) => calls.push({ kind: 'set', value, time }), linearRampToValueAtTime: (value: number, time: number) => calls.push({ kind: 'ramp', value, time }) } };
};

// MIO-PRV-00.06 (#368 intent): live playback must follow linear/smooth automation, not per-step stairs.
export function runMusicLiveAutomationTests(): { passed: number; total: number } {
  const tests: Array<[string, () => void]> = [
    ['step lanes set one value at the step start', () => {
      const events = planMusicAutomationStep(lane('step'), 1);
      assert(events.length === 1 && events[0].kind === 'set' && events[0].value === 0, 'step lane should hold the left value');
    }],
    ['linear lanes anchor then ramp to the next step value', () => {
      const events = planMusicAutomationStep(lane('linear'), 1);
      assert(events.length === 2 && near(events[0].value, .25) && events[1].kind === 'ramp' && events[1].stepOffset === 1 && near(events[1].value, .5), 'linear ramp wrong');
    }],
    ['smooth lanes follow smoothstep with four segments', () => {
      const events = planMusicAutomationStep(lane('smooth'), 2);
      const t = 2.5 / 4, expectedMid = t * t * (3 - 2 * t);
      assert(events.length === 5 && near(events[2].value, expectedMid), 'smooth midpoint does not follow smoothstep');
    }],
    ['adjacent steps chain without gaps and with mapped values', () => {
      const { calls, param } = recorder();
      for (const step of [0, 1]) applyMusicAutomationStep(param, planMusicAutomationStep(lane('linear'), step), 10 + step * .125, .125, value => value * 2);
      assert(calls.map(call => call.kind).join(',') === 'set,ramp,set,ramp', 'unexpected event order');
      assert(near(calls[1].time, calls[2].time) && near(calls[1].value, calls[2].value), 'step boundary is discontinuous');
      assert(near(calls[3].value, 1) && near(calls[3].time, 10.25), 'mapped end value or time wrong');
    }],
    ['lanes without points schedule nothing', () => {
      assert(planMusicAutomationStep({ ...lane('linear'), points: [] }, 0).length === 0, 'empty lane scheduled events');
    }],
  ];
  let passed = 0;
  for (const [name, run] of tests) { run(); passed++; console.log(`✓ [PASS] ${name}`); }
  return { passed, total: tests.length };
}
