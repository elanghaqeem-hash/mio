import type { PointerPoint } from './TransformGizmoController';

export type ViewportGestureMode = 'IDLE' | 'SINGLE' | 'MULTI';
export interface ViewportGesturePair { distance: number; center: PointerPoint }
export interface ViewportGestureState {
  mode: ViewportGestureMode;
  pointers: Map<number, PointerPoint>;
  primaryId?: number;
  lastPoint?: PointerPoint;
  lastPair?: ViewportGesturePair;
}
export interface ViewportGestureUpdate {
  state: ViewportGestureState;
  singleDelta?: PointerPoint;
  multi?: { scale: number; pan: PointerPoint };
  enteredMulti?: boolean;
  exitedMulti?: boolean;
}

const finitePoint = (p: PointerPoint): PointerPoint => {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Gesture pointer coordinates must be finite');
  return { x: p.x, y: p.y };
};
const pair = (pointers: Map<number, PointerPoint>): ViewportGesturePair | undefined => {
  const values = [...pointers.values()];
  if (values.length < 2) return;
  const a = values[0], b = values[1];
  return { distance: Math.hypot(b.x - a.x, b.y - a.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
};
const copyPointers = (pointers: Map<number, PointerPoint>) => new Map([...pointers].map(([id, p]) => [id, { ...p }]));
export const createViewportGestureState = (): ViewportGestureState => ({ mode: 'IDLE', pointers: new Map() });

export const gesturePointerDown = (state: ViewportGestureState, id: number, point: PointerPoint): ViewportGestureUpdate => {
  const pointers = copyPointers(state.pointers); pointers.set(id, finitePoint(point));
  if (pointers.size >= 2) return { state: { mode: 'MULTI', pointers, lastPair: pair(pointers) }, enteredMulti: state.mode !== 'MULTI' };
  return { state: { mode: 'SINGLE', pointers, primaryId: id, lastPoint: finitePoint(point) } };
};

export const gesturePointerMove = (state: ViewportGestureState, id: number, point: PointerPoint): ViewportGestureUpdate => {
  if (!state.pointers.has(id)) return { state };
  const pointers = copyPointers(state.pointers); pointers.set(id, finitePoint(point));
  if (state.mode === 'MULTI' || pointers.size >= 2) {
    const current = pair(pointers), previous = state.lastPair;
    const scale = current && previous && current.distance > 1 && previous.distance > 1 ? previous.distance / current.distance : 1;
    const pan = current && previous ? { x: current.center.x - previous.center.x, y: current.center.y - previous.center.y } : { x: 0, y: 0 };
    return { state: { mode: 'MULTI', pointers, lastPair: current }, multi: { scale, pan } };
  }
  if (state.mode === 'SINGLE' && state.primaryId === id && state.lastPoint) {
    const p = finitePoint(point), delta = { x: p.x - state.lastPoint.x, y: p.y - state.lastPoint.y };
    return { state: { ...state, pointers, lastPoint: p }, singleDelta: delta };
  }
  return { state: { ...state, pointers } };
};

export const gesturePointerEnd = (state: ViewportGestureState, id: number): ViewportGestureUpdate => {
  if (!state.pointers.has(id)) return { state };
  const pointers = copyPointers(state.pointers); pointers.delete(id);
  if (state.mode === 'MULTI') {
    if (pointers.size >= 2) return { state: { mode: 'MULTI', pointers, lastPair: pair(pointers) } };
    if (pointers.size === 1) {
      const [primaryId, p] = [...pointers.entries()][0];
      return { state: { mode: 'SINGLE', pointers, primaryId, lastPoint: { ...p } }, exitedMulti: true };
    }
    return { state: createViewportGestureState(), exitedMulti: true };
  }
  if (pointers.size === 0) return { state: createViewportGestureState() };
  const [primaryId, p] = [...pointers.entries()][0];
  return { state: { mode: 'SINGLE', pointers, primaryId, lastPoint: { ...p } } };
};

export const gesturePointerCancel = gesturePointerEnd;
