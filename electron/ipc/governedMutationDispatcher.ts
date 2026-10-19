/**
 * PRV-10.06i — fail-closed governed mutation capability dispatcher.
 * Delegates to the pre-existing desktop approval and durable checkpoint executor.
 * NEVER directly calls workspaceSandbox.mutate or issues approval tokens.
 */
import type { DesktopMutationTransaction } from './mutationApproval';

export interface GovernedMutationDeps {
  authorized(workspaceId: string): boolean;
  stopped(): boolean;
  execute(transaction: DesktopMutationTransaction, approvalToken: string): Promise<{ success: boolean; receipt?: unknown; error?: string }>;
}
export interface GovernedMutationRequest {
  schemaVersion: 1;
  capabilityId: 'desktop.workspace.execute-approved-mutation';
  permissionLevel: 'L3_MODIFY' | 'L5_DESTRUCTIVE';
  transaction: DesktopMutationTransaction;
  approvalToken: string;
}
const identity = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const workspaceIdentity = (value: unknown): value is string =>
  typeof value === 'string' && /^ws_[A-Za-z0-9-]{1,125}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value: Record<string, unknown>, names: readonly string[]): boolean =>
  Object.keys(value).every(key => names.includes(key)) && names.every(key => Object.hasOwn(value, key));
const PATH_MAX = 4096;
const safePath = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= PATH_MAX &&
  !value.includes('\0') && !value.startsWith('/') && !value.includes('\\') &&
  !/^[A-Za-z]:/.test(value) && !value.split('/').some(part => part === '..' || part === '') &&
  value !== '.';

function validTransaction(value: unknown): value is DesktopMutationTransaction {
  if (!object(value) || !exact(value, ['id', 'workspaceId', 'operations']) ||
      !identity(value.id) || !workspaceIdentity(value.workspaceId) ||
      !Array.isArray(value.operations) || value.operations.length < 1 || value.operations.length > 100) return false;
  const operationIds = new Set<string>();
  for (const entry of value.operations) {
    if (!object(entry) || !identity(entry.id) ||
        Object.keys(entry).some(key => !['id', 'kind', 'source', 'target', 'collisionPolicy'].includes(key)) ||
        !Object.hasOwn(entry, 'kind') || !Object.hasOwn(entry, 'id') || !Object.hasOwn(entry, 'collisionPolicy') ||
        entry.collisionPolicy !== 'BLOCK' ||
        !['MKDIR', 'RENAME', 'MOVE', 'COPY', 'TRASH'].includes(String(entry.kind)) ||
        operationIds.has(entry.id)) return false;
    operationIds.add(entry.id);
    const kind = entry.kind;
    if (kind === 'MKDIR') {
      if (entry.source !== undefined || !safePath(entry.target)) return false;
    } else if (kind === 'TRASH') {
      if (!safePath(entry.source) || entry.target !== undefined) return false;
    } else if (!safePath(entry.source) || !safePath(entry.target) || entry.source === entry.target) return false;
  }
  return true;
}
export class GovernedDesktopMutationDispatcher {
  constructor(private readonly deps: GovernedMutationDeps) {}
  async invoke(raw: unknown): Promise<{ success: boolean; receipt?: unknown; error?: string }> {
    if (!object(raw) || !exact(raw, ['schemaVersion', 'capabilityId', 'permissionLevel', 'transaction', 'approvalToken']) ||
        raw.schemaVersion !== 1 || raw.capabilityId !== 'desktop.workspace.execute-approved-mutation' ||
        (raw.permissionLevel !== 'L3_MODIFY' && raw.permissionLevel !== 'L5_DESTRUCTIVE') ||
        !validTransaction(raw.transaction) || typeof raw.approvalToken !== 'string' ||
        !/^[a-f0-9]{64}$/.test(raw.approvalToken)) return { success: false, error: 'CAPABILITY_MUTATION_INVALID' };
    const transaction = raw.transaction;
    if (transaction.operations.some(operation => operation.kind === 'TRASH') && raw.permissionLevel !== 'L5_DESTRUCTIVE')
      return { success: false, error: 'CAPABILITY_MUTATION_PERMISSION_DENIED' };
    if (this.deps.stopped()) return { success: false, error: 'CAPABILITY_STOPPED' };
    if (!this.deps.authorized(transaction.workspaceId)) return { success: false, error: 'CAPABILITY_WORKSPACE_UNAUTHORIZED' };
    // Existing executor consumes a one-use approval token, reserves fsynced checkpoints,
    // serializes overlapping mutations, and obeys STOP between operations.
    try {
      const result = await this.deps.execute(transaction, raw.approvalToken);
      if (!result.success) return { success: false, error: result.error ?? 'CAPABILITY_MUTATION_FAILED', receipt: result.receipt };
      // STOP may be triggered after the operation has committed; never misrepresent it as safely cancelled.
      if (this.deps.stopped() || !this.deps.authorized(transaction.workspaceId))
        return { success: false, error: 'CAPABILITY_MUTATION_COMMITTED_REVIEW_REQUIRED', receipt: result.receipt };
      return result;
    } catch {
      return { success: false, error: 'CAPABILITY_MUTATION_UNCERTAIN_REVIEW_REQUIRED' };
    }
  }
}
