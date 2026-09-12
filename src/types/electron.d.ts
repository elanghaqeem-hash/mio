import { MioDesktopAPI } from '../../electron/preload';

declare global {
  interface Window {
    mioDesktop?: MioDesktopAPI;
  }
}

export {};
