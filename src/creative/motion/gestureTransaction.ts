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

export interface MotionGestureSession<T> {
  transaction: MotionGestureTransaction<T>;
  applyPreview(next: T): void;
  commit(): T;
  cancel(): T;
}

export const createMotionGestureSession = <T>(initial: T, onPreview: (value: T) => void): MotionGestureSession<T> => {
  let transaction = beginMotionGesture(initial);
  return {
    get transaction() { return transaction; },
    applyPreview(next) { transaction = previewMotionGesture(transaction, next); onPreview(transaction.preview); },
    commit() { transaction = commitMotionGesture(transaction); return transaction.preview; },
    cancel() { transaction = cancelMotionGesture(transaction); onPreview(transaction.initial); return transaction.initial; },
  };
};
