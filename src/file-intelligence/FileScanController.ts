export type ScanControlState = 'RUNNING' | 'PAUSED' | 'CANCELLED';

export class FileScanController {
  private stateValue: ScanControlState = 'RUNNING';
  private waiters: Array<() => void> = [];

  public get state(): ScanControlState { return this.stateValue; }

  public pause(): void {
    if (this.stateValue === 'RUNNING') this.stateValue = 'PAUSED';
  }

  public resume(): void {
    if (this.stateValue !== 'PAUSED') return;
    this.stateValue = 'RUNNING';
    this.releaseWaiters();
  }

  public cancel(): void {
    if (this.stateValue === 'CANCELLED') return;
    this.stateValue = 'CANCELLED';
    this.releaseWaiters();
  }

  public async checkpoint(): Promise<void> {
    if (this.stateValue === 'CANCELLED') throw new DOMException('File scan cancelled', 'AbortError');
    if (this.stateValue !== 'PAUSED') return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.state === 'CANCELLED') throw new DOMException('File scan cancelled', 'AbortError');
  }

  private releaseWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}
