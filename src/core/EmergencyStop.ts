import { eventBus } from './EventBus';

class EmergencyStopController {
  private stopped: boolean = false;
  private stopReason: string = '';
  private cancelCallbacks: Set<() => void> = new Set();

  public registerAbortHandler(handler: () => void): () => void {
    this.cancelCallbacks.add(handler);
    return () => this.cancelCallbacks.delete(handler);
  }

  public triggerEmergencyStop(reason: string = 'User triggered STOP MIO') {
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

    eventBus.emit('EMERGENCY_STOP_TRIGGERED', { reason, timestamp: Date.now() });
    eventBus.emit('CORE_STATE_CHANGE', 'ERROR');
  }

  public reset() {
    this.stopped = false;
    this.stopReason = '';
    eventBus.emit('EMERGENCY_STOP_RESET', { timestamp: Date.now() });
    eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
  }

  public isEmergencyStopped(): boolean {
    return this.stopped;
  }

  public getReason(): string {
    return this.stopReason;
  }
}

export const emergencyStop = new EmergencyStopController();
