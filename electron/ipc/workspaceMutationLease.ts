/**
 * Main-process-only workspace mutation lease.
 * Synchronous acquire prevents another IPC callback starting in the same
 * workspace while a prior handler is suspended on an asynchronous file action.
 * No queuing or auto-retry: a caller must request a fresh approval.
 */
export class DesktopWorkspaceMutationLease {
  private readonly active = new Set<string>();

  acquire(workspaceId: string): () => void {
    if (!workspaceId || this.active.has(workspaceId)) {
      throw new Error('WORKSPACE_MUTATION_ALREADY_ACTIVE');
    }
    this.active.add(workspaceId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.delete(workspaceId);
    };
  }

  isActive(workspaceId: string): boolean {
    return this.active.has(workspaceId);
  }

  hasActive(): boolean {
    return this.active.size > 0;
  }
}
