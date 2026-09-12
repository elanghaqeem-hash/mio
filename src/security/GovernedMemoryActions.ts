import { ProjectManager } from '../project/ProjectManager';
import type { AuthorizationScope, MemoryItem } from '../types/security';
import { MioMemoryManager } from './MemoryManager';
import { PermissionEngine } from './PermissionEngine';

export class GovernedMemoryActions {
  public static async deleteMemory(memory: MemoryItem): Promise<boolean> {
    const projectId = ProjectManager.getProject().id;
    const taskId = `security_delete_memory_${memory.id}`;
    const scope: AuthorizationScope = {
      taskId,
      projectId,
      action: 'MEMORY:DELETE',
      target: `Long-term memory ${memory.id}`,
      resourceId: `memory:${memory.id}`,
      networkAllowed: false,
    };
    const grant = await PermissionEngine.requestScopedPermission({
      ...scope,
      level: 'L3_MODIFY',
      changes: [`Delete long-term memory item ${memory.id}`],
      risks: ['The selected persistent memory item will no longer be available to MIO.'],
      expectedResult: 'Exactly one selected long-term memory item is removed.',
      maxUses: 1,
      ttlMs: 30_000,
    });
    if (!grant || !PermissionEngine.consumeGrant(grant.id, scope)) return false;
    return MioMemoryManager.deleteMemory(memory.id);
  }

  public static async clearAll(): Promise<boolean> {
    const projectId = ProjectManager.getProject().id;
    const taskId = `security_clear_memory_${projectId}`;
    const scope: AuthorizationScope = {
      taskId,
      projectId,
      action: 'MEMORY:CLEAR_ALL',
      target: 'Controlled Long-Term Memory',
      resourceId: 'memory:all',
      networkAllowed: false,
    };
    const grant = await PermissionEngine.requestScopedPermission({
      ...scope,
      level: 'L5_DESTRUCTIVE',
      changes: ['Delete all persistent long-term memories.', 'Delete every pending long-term memory review candidate.'],
      risks: ['This destructive operation removes all current long-term memory records and review candidates from MIO storage.'],
      expectedResult: 'Long-term memory and its pending review queue become empty.',
      maxUses: 1,
      ttlMs: 30_000,
      forceDryRun: true,
    });
    if (!grant || !PermissionEngine.consumeGrant(grant.id, scope)) return false;
    MioMemoryManager.clearAll();
    return true;
  }
}
