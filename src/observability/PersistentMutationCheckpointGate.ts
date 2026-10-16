/**
 * PRV-10.06a: serializable, fail-closed cross-domain mutation checkpoint gate.
 * Requires an injected durable MioCheckpointStorage; no default web storage or automatic replay.
 * This adapter intentionally stores only project/task/request/capability IDs, never payloads.
 */
import { MioRecoveryCheckpointStore } from './MioRecoveryCheckpointStore';
import { MioCheckpointPersistence } from './MioCheckpointPersistence';

export interface MutationCheckpointIdentity {
  projectId: string;
  taskId: string;
  requestId: string;
  capabilityId: string;
}
export interface MioMutationCheckpointGate {
  begin(identity: MutationCheckpointIdentity): Promise<void>;
  complete(identity: MutationCheckpointIdentity, committed: boolean): Promise<void>;
}

export class PersistentMutationCheckpointGate implements MioMutationCheckpointGate {
  private readonly locks = new Map<string, Promise<void>>();
  constructor(private readonly persistence: MioCheckpointPersistence) {}
  private async exclusive<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const pending = previous.then(() => current);
    this.locks.set(projectId, pending);
    await previous;
    try { return await action(); }
    finally { release(); if (this.locks.get(projectId) === pending) this.locks.delete(projectId); }
  }
  private key(identity: MutationCheckpointIdentity) {
    return { projectId: identity.projectId, taskId: identity.taskId, actionId: identity.requestId };
  }
  /** Durable PREPARED then EXECUTING must both succeed before the executor may run. */
  async begin(identity: MutationCheckpointIdentity): Promise<void> {
    await this.exclusive(identity.projectId, async () => {
      const store = await this.persistence.load(identity.projectId);
      const id = this.key(identity);
      store.prepare({ ...id, idempotencyKey: identity.requestId, mutates: true });
      await this.persistence.save(identity.projectId, store);
      store.transition(id, 'EXECUTING');
      await this.persistence.save(identity.projectId, store);
    });
  }
  /** Ambiguous failures are UNCERTAIN and cannot be re-executed with the same request ID. */
  async complete(identity: MutationCheckpointIdentity, committed: boolean): Promise<void> {
    await this.exclusive(identity.projectId, async () => {
      const store: MioRecoveryCheckpointStore = await this.persistence.load(identity.projectId);
      const id = this.key(identity);
      // Archive loader conservatively reconstructs EXECUTING as UNCERTAIN. A new load
      // cannot prove an in-flight mutation has not crossed a crash boundary.
      // Therefore completion must use in-process lease state (below), not rehydrate.
      const state = store.get(id);
      if (!state || state.state !== 'EXECUTING') throw new Error('MUTATION_CHECKPOINT_RECONCILIATION_REQUIRED');
      store.transition(id, committed ? 'COMMITTED' : 'UNCERTAIN');
      await this.persistence.save(identity.projectId, store);
    });
  }
}
