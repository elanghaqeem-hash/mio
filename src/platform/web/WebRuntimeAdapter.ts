import type { MioRuntimeAdapter, RuntimeCapabilities } from '../RuntimeAdapter';

export class WebRuntimeAdapter implements MioRuntimeAdapter {
  public readonly kind = 'web' as const;

  public getCapabilities(): RuntimeCapabilities {
    const hasNavigator = typeof navigator !== 'undefined';
    const hasWindow = typeof window !== 'undefined';

    return {
      runtime: 'web',
      persistentStorage: hasWindow && 'indexedDB' in window,
      scopedFileAccess: hasWindow && 'showOpenFilePicker' in window,
      notifications: hasWindow && 'Notification' in window,
      microphone: hasNavigator && Boolean(navigator.mediaDevices),
      camera: hasNavigator && Boolean(navigator.mediaDevices),
      localModel: false,
      nativeProcesses: false,
    };
  }

  public isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : false;
  }

  public now(): number {
    return Date.now();
  }
}

export const webRuntimeAdapter = new WebRuntimeAdapter();
