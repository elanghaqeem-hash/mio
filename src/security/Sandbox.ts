import { SecurityEvent } from '../types/security';
import { eventBus } from '../core/EventBus';

export interface ResourceLimitConfig {
  maxGenerationSteps: number;
  maxExecutionTimeMs: number;
  maxMemoryMb: number;
  maxFileSizeKb: number;
}

export class Sandbox {
  private static defaultLimits: ResourceLimitConfig = {
    maxGenerationSteps: 100,
    maxExecutionTimeMs: 15000,
    maxMemoryMb: 256,
    maxFileSizeKb: 10240, // 10MB
  };

  /**
   * Prevents path traversal attacks (e.g. `../../etc/passwd` or outside project scope)
   */
  public static validatePath(requestedPath: string, allowedRoot: string = 'PROJECT/'): boolean {
    const normalized = requestedPath.replace(/\\/g, '/');

    if (normalized.includes('../') || normalized.includes('..\\') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
      const secEvent: SecurityEvent = {
        id: `sec_${Date.now()}`,
        timestamp: Date.now(),
        level: 'blocked',
        category: 'FILE_INTEGRITY',
        action: 'PATH_TRAVERSAL_PREVENTION',
        details: `Path traversal attempt blocked: "${requestedPath}" escapes sandbox root "${allowedRoot}"`,
        blocked: true,
      };
      eventBus.emit('SECURITY_EVENT', secEvent);
      return false;
    }

    return true;
  }

  /**
   * Wraps an asynchronous operation in a timeout and resource guard
   */
  public static async executeGuarded<T>(
    operationName: string,
    fn: () => Promise<T>,
    timeoutMs: number = 15000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const secEvent: SecurityEvent = {
          id: `sec_${Date.now()}`,
          timestamp: Date.now(),
          level: 'warning',
          category: 'RESOURCE_LIMIT',
          action: operationName,
          details: `Operation exceeded execution time limit of ${timeoutMs}ms`,
          blocked: true,
        };
        eventBus.emit('SECURITY_EVENT', secEvent);
        reject(new Error(`Sandbox Error: Operation '${operationName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
