import type { PoseAxis } from './PoseOperations';
import type { PoseTool } from './PoseEditSession';
import type { TransformOrientation, ViewPreset } from './Animation3DViewport';

export interface AnimationEditorSelection { rigId: string; boneId: string }
export interface AnimationEditorState {
  selection?: AnimationEditorSelection;
  time: number;
  autoKey: boolean;
  poseTool: PoseTool;
  poseAxis: PoseAxis;
  orientation: TransformOrientation;
  viewPreset: ViewPreset;
  frameSelectedToken: number;
}

export const DEFAULT_ANIMATION_EDITOR_STATE: AnimationEditorState = {
  time: 0,
  autoKey: false,
  poseTool: 'ROTATE',
  poseAxis: 'z',
  orientation: 'WORLD',
  viewPreset: 'PERSPECTIVE',
  frameSelectedToken: 0,
};

const finiteTime = (time: number): number => {
  if (!Number.isFinite(time)) throw new Error('Animation editor time must be finite');
  return Math.max(0, time);
};

export const selectAnimationBone = (state: AnimationEditorState, rigId: string, boneId: string): AnimationEditorState => {
  if (!rigId || !boneId) throw new Error('Animation editor selection requires rig and bone ids');
  return { ...state, selection: { rigId, boneId } };
};
export const clearAnimationSelection = (state: AnimationEditorState): AnimationEditorState => ({ ...state, selection: undefined });
export const setAnimationEditorTime = (state: AnimationEditorState, time: number): AnimationEditorState => ({ ...state, time: finiteTime(time) });
export const setAnimationEditorAutoKey = (state: AnimationEditorState, autoKey: boolean): AnimationEditorState => ({ ...state, autoKey });
export const setAnimationEditorTool = (state: AnimationEditorState, poseTool: PoseTool): AnimationEditorState => ({ ...state, poseTool });
export const setAnimationEditorAxis = (state: AnimationEditorState, poseAxis: PoseAxis): AnimationEditorState => ({ ...state, poseAxis });
export const setAnimationEditorOrientation = (state: AnimationEditorState, orientation: TransformOrientation): AnimationEditorState => ({ ...state, orientation });
export const setAnimationEditorViewPreset = (state: AnimationEditorState, viewPreset: ViewPreset): AnimationEditorState => ({ ...state, viewPreset });
export const requestFrameSelected = (state: AnimationEditorState): AnimationEditorState => ({ ...state, frameSelectedToken: state.frameSelectedToken + 1 });

export const reconcileAnimationEditorState = (state: AnimationEditorState, validSelections: readonly AnimationEditorSelection[], duration: number): AnimationEditorState => {
  const safeDuration = Number.isFinite(duration) && duration >= 0 ? duration : 0;
  const selection = state.selection && validSelections.some(v => v.rigId === state.selection!.rigId && v.boneId === state.selection!.boneId) ? state.selection : undefined;
  return { ...state, selection, time: Math.min(finiteTime(state.time), safeDuration) };
};
