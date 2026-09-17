import type { PointerPoint } from './TransformGizmoController';
import { createViewportGestureState, gesturePointerCancel, gesturePointerDown, gesturePointerEnd, gesturePointerMove, type ViewportGestureState } from './ViewportGestureState';

export interface ViewportGestureCallbacks {
  onSingleStart?: (id: number, point: PointerPoint) => void;
  onSingleMove?: (id: number, point: PointerPoint, delta: PointerPoint) => void;
  onSingleEnd?: (id: number, cancelled: boolean) => void;
  onMultiStart?: () => void;
  onMultiMove?: (scale: number, pan: PointerPoint) => void;
  onMultiEnd?: (remainingPointerId?: number) => void;
}

export class ViewportGestureController {
  private state: ViewportGestureState = createViewportGestureState();
  constructor(private readonly callbacks: ViewportGestureCallbacks = {}) {}
  get snapshot(): ViewportGestureState { return this.state; }
  reset(): void { this.state = createViewportGestureState(); }

  pointerDown(id: number, point: PointerPoint): void {
    const previousMode = this.state.mode;
    const update = gesturePointerDown(this.state, id, point);
    this.state = update.state;
    if (update.enteredMulti) {
      if (previousMode === 'SINGLE') this.callbacks.onSingleEnd?.(id, true);
      this.callbacks.onMultiStart?.();
    } else if (this.state.mode === 'SINGLE') this.callbacks.onSingleStart?.(id, point);
  }

  pointerMove(id: number, point: PointerPoint): void {
    const update = gesturePointerMove(this.state, id, point);
    this.state = update.state;
    if (update.multi) this.callbacks.onMultiMove?.(update.multi.scale, update.multi.pan);
    else if (update.singleDelta) this.callbacks.onSingleMove?.(id, point, update.singleDelta);
  }

  pointerEnd(id: number, cancelled = false): void {
    const wasSingle = this.state.mode === 'SINGLE' && this.state.primaryId === id;
    const update = (cancelled ? gesturePointerCancel : gesturePointerEnd)(this.state, id);
    this.state = update.state;
    if (wasSingle) this.callbacks.onSingleEnd?.(id, cancelled);
    if (update.exitedMulti) this.callbacks.onMultiEnd?.(this.state.primaryId);
  }
}
