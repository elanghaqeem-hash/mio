import type { MotionComposition } from "./model";

export interface MotionPlaybackState {
  frame: number;
  playing: boolean;
  loop: boolean;
  rate: number;
  frameRemainder?: number;
}

export const clampMotionFrame = (composition: MotionComposition, frame: number): number =>
  Math.max(0, Math.min(composition.durationFrames - 1, Math.round(frame)));

export const motionFrameToSeconds = (frame: number, fps: number): number => frame / fps;

export const motionSecondsToFrame = (seconds: number, fps: number): number => Math.round(seconds * fps);

export function stepMotionPlayback(composition: MotionComposition, state: MotionPlaybackState, elapsedSeconds: number): MotionPlaybackState {
  if (!state.playing || elapsedSeconds <= 0) return state;
  const [workStart, workEnd] = composition.workArea;
  const exactDelta = Math.max(0, elapsedSeconds * composition.fps * state.rate) + (state.frameRemainder ?? 0);
  const deltaFrames = Math.floor(exactDelta + 1e-9);
  const frameRemainder = exactDelta - deltaFrames;
  if (deltaFrames === 0) return { ...state, frameRemainder };
  let frame = state.frame + deltaFrames;
  if (frame <= workEnd) return { ...state, frame, frameRemainder };
  if (!state.loop) return { ...state, frame: workEnd, playing: false, frameRemainder: 0 };
  const span = Math.max(1, workEnd - workStart + 1);
  frame = workStart + ((frame - workStart) % span);
  return { ...state, frame, frameRemainder };
}
