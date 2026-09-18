export interface MotionGestureTransaction<T> {
  readonly initial: T;
  readonly preview: T;
  readonly committed: boolean;
}

export const beginMotionGesture = <T>(initial: T): MotionGestureTransaction<T> => ({ initial, preview: initial, committed: false });

export const previewMotionGesture = <T>(transaction: MotionGestureTransaction<T>, preview: T): MotionGestureTransaction<T> =>
  transaction.committed ? transaction : { ...transaction, preview };

export const commitMotionGesture = <T>(transaction: MotionGestureTransaction<T>): MotionGestureTransaction<T> =>
  transaction.committed ? transaction : { ...transaction, committed: true };

export const cancelMotionGesture = <T>(transaction: MotionGestureTransaction<T>): MotionGestureTransaction<T> =>
  ({ initial: transaction.initial, preview: transaction.initial, committed: false });
