import { eventBus } from './EventBus';

class EmergencyStopController {
  private stopped: boolean = false;
  private stopReason: string = '';
  private cancelCallbacks: Set<() => void> = new Set();

  public registerAbortHandler(handler: () => void): () => void {
    this.cancelCallbacks.add(handler);
    return () => this.cancelCallbacks.delete(handler);
  }

  /**
   * `fromMainProcess` marks a STOP that the Electron main process already handled (tray or IPC echo), so it is
   * not forwarded back. Every other STOP is forwarded so main-process work (training jobs) is cancelled too.
   */
  public triggerEmergencyStop(reason: string = 'User triggered STOP MIO', options: { fromMainProcess?: boolean } = {}) {
    this.stopped = true;
    this.stopReason = reason;
    console.warn(`[EMERGENCY STOP] Triggered: ${reason}`);

    // Call all abort handlers (audio, generation, animation, tasks)
    this.cancelCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('Error during abort execution:', e);
      }
    });

    if (!options.fromMainProcess) this.forwardToMainProcess(reason);

    eventBus.emit('SECURITY_EVENT', { id: `emergency_stop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now(), level: 'warning', category: 'EMERGENCY_STOP', action: 'STOP_MIO_TRIGGERED', details: reason.slice(0, 500), blocked: true });
    eventBus.emit('EMERGENCY_STOP_TRIGGERED', { reason, timestamp: Date.now() });
    eventBus.emit('CORE_STATE_CHANGE', 'ERROR');
  }

  public reset() {
    this.stopped = false;
    this.stopReason = '';
    eventBus.emit('SECURITY_EVENT', { id: `emergency_reset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now(), level: 'info', category: 'EMERGENCY_STOP', action: 'STOP_MIO_RESET', details: 'Emergency stop reset; new work may start', blocked: false });
    eventBus.emit('EMERGENCY_STOP_RESET', { timestamp: Date.now() });
    eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
  }

  private forwardToMainProcess(reason: string): void {
    const desktop = (globalThis as { mioDesktop?: { triggerEmergencyStop?: (reason: string) => Promise<unknown> } }).mioDesktop;
    if (typeof desktop?.triggerEmergencyStop !== 'function') return;
    try {
      void Promise.resolve(desktop.triggerEmergencyStop(reason)).catch((error) => console.error('Desktop emergency stop could not be delivered:', error));
    } catch (error) {
      console.error('Desktop emergency stop could not be delivered:', error);
    }
  }

  public isEmergencyStopped(): boolean {
    return this.stopped;
  }

  public getReason(): string {
    return this.stopReason;
  }
}

export const emergencyStop = new EmergencyStopController();
