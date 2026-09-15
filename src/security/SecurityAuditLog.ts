import { eventBus } from '../core/EventBus';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { SecurityEvent } from '../types/security';

const STORAGE_KEY = 'security-audit-v1';
const MAX_EVENTS = 300;

export class SecurityAuditLog {
  private storage: StorageProvider = defaultStorageProvider;
  private events: SecurityEvent[] = [];
  private initialized = false;
  private subscribed = false;

  public setStorageProvider(provider: StorageProvider): void {
    this.storage = provider;
    this.initialized = false;
    this.events = [];
  }

  public async initialize(): Promise<void> {
    if (!this.subscribed) {
      eventBus.on<SecurityEvent>('SECURITY_EVENT', (event) => this.record(event));
      this.subscribed = true;
    }
    try {
      const stored = await this.storage.get<SecurityEvent[]>('runtime', STORAGE_KEY);
      this.events = Array.isArray(stored) ? stored.slice(0, MAX_EVENTS) : [];
    } catch (error) {
      console.error('[SecurityAuditLog] Failed to restore audit events.', error);
      this.events = [];
    }
    this.initialized = true;
    eventBus.emit('SECURITY_AUDIT_UPDATED', this.getEvents());
  }

  public getEvents(): SecurityEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  public async flush(): Promise<void> {
    if (!this.initialized) return;
    try {
      await this.storage.set('runtime', STORAGE_KEY, this.events);
    } catch (error) {
      console.error('[SecurityAuditLog] Failed to persist audit events.', error);
    }
  }

  public async clear(): Promise<void> {
    this.events = [];
    eventBus.emit('SECURITY_AUDIT_UPDATED', []);
    await this.flush();
  }

  private record(event: SecurityEvent): void {
    if (this.events.some((existing) => existing.id === event.id)) return;
    this.events = [{ ...event }, ...this.events].slice(0, MAX_EVENTS);
    eventBus.emit('SECURITY_AUDIT_UPDATED', this.getEvents());
    void this.flush();
  }
}

export const securityAuditLog = new SecurityAuditLog();
