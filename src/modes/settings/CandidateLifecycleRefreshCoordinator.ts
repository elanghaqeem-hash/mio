import { systemPreferences } from '../../settings/SystemPreferences';
import {
  subscribeStorageMutations,
  type StorageMutationEvent,
} from '../../storage/ObservableStorageProvider';

export interface CandidateLifecycleRefreshCoordinatorOptions {
  debounceMs?: number;
  subscribeStorage?: (handler: (event: StorageMutationEvent) => void) => () => void;
  subscribePreferences?: (handler: () => void) => () => void;
  setTimer?: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_DEBOUNCE_MS = 120;

export function subscribeCandidateLifecycleRefresh(
  listener: () => void,
  options: CandidateLifecycleRefreshCoordinatorOptions = {},
): () => void {
  const debounceMs = Math.max(0, Math.min(options.debounceMs ?? DEFAULT_DEBOUNCE_MS, 2_000));
  const subscribeStorage = options.subscribeStorage ?? subscribeStorageMutations;
  const subscribePreferences = options.subscribePreferences
    ?? ((handler: () => void) => systemPreferences.subscribe(() => handler()));
  const setTimer = options.setTimer ?? ((handler, delayMs) => globalThis.setTimeout(handler, delayMs));
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));

  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const schedule = () => {
    if (disposed) return;
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(() => {
      timer = undefined;
      if (!disposed) listener();
    }, debounceMs);
  };

  const unsubscribeStorage = subscribeStorage((event) => {
    if (event.schemaVersion === 1 && event.namespace === 'training') schedule();
  });
  const unsubscribePreferences = subscribePreferences(schedule);

  return () => {
    disposed = true;
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
    unsubscribeStorage();
    unsubscribePreferences();
  };
}
