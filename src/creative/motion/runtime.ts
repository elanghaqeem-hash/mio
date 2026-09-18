import type { MotionComposition } from "./model";

export interface MotionPlaybackState {
  frame: number;
  playing: boolean;
  loop: boolean;
  rate: number;
}

export const clampMotionFrame = (composition: MotionComposition, frame: number): number =>
  Math.max(0, Math.min(composition.durationFrames - 1, Math.round(frame)));

export const motionFrameToSeconds = (frame: number, fps: number): number => frame / fps;

export const motionSecondsToFrame = (seconds: number, fps: number): number => Math.round(seconds * fps);

export function stepMotionPlayback(composition: MotionComposition, state: MotionPlaybackState, elapsedSeconds: number): MotionPlaybackState {
  if (!state.playing || elapsedSeconds <= 0) return state;
  const [workStart, workEnd] = composition.workArea;
  const deltaFrames = Math.max(0, Math.round(elapsedSeconds * composition.fps * state.rate));
  let frame = state.frame + deltaFrames;
  if (frame <= workEnd) return { ...state, frame };
  if (!state.loop) return { ...state, frame: workEnd, playing: false };
  const span = Math.max(1, workEnd - workStart + 1);
  frame = workStart + ((frame - workStart) % span);
  return { ...state, frame };
}
