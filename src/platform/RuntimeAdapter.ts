export type MioRuntimeKind = 'web' | 'desktop';

export interface RuntimeCapabilities {
  runtime: MioRuntimeKind;
  persistentStorage: boolean;
  scopedFileAccess: boolean;
  notifications: boolean;
  microphone: boolean;
  camera: boolean;
  localModel: boolean;
  nativeProcesses: boolean;
}

export interface MioRuntimeAdapter {
  readonly kind: MioRuntimeKind;
  getCapabilities(): RuntimeCapabilities;
  isOnline(): boolean;
  now(): number;
}

/**
 * Platform-independent code may depend on this contract, but must not depend
 * directly on browser globals, Electron IPC, Node.js, or operating-system APIs.
 */
export type RuntimeAdapterFactory = () => MioRuntimeAdapter;
