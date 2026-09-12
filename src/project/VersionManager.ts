import { MioProject, ProjectVersion } from '../types/project';
import { ProjectManager } from './ProjectManager';
import { eventBus } from '../core/EventBus';

export class VersionManager {
  private static historyStack: string[] = [];
  private static redoStack: string[] = [];
  private static maxSnapshots = 20;

  public static takeSnapshot(description = 'Snapshot taken') {
    const project = ProjectManager.getProject();
    const serialized = JSON.stringify(project);
    this.historyStack.push(serialized);
    if (this.historyStack.length > this.maxSnapshots) this.historyStack.shift();
    this.redoStack = [];

    const versionItem: ProjectVersion = { versionId: `ver_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, timestamp: Date.now(), description: description.slice(0, 500), snapshot: serialized };
    project.versions.unshift(versionItem);
    if (project.versions.length > this.maxSnapshots) project.versions.length = this.maxSnapshots;
    project.lastModified = Date.now();
    eventBus.emit('VERSION_SNAPSHOT_TAKEN', versionItem);
    eventBus.emit('PROJECT_UPDATED', { ...project });
    void ProjectManager.saveCurrent();
  }

  public static undo(): boolean {
    if (this.historyStack.length <= 1) return false;
    const current = this.historyStack.pop()!;
    this.redoStack.push(current);
    const previous = this.historyStack[this.historyStack.length - 1];
    if (!previous) return false;
    return this.applySnapshot(previous, 'Undo operation performed');
  }

  public static redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const next = this.redoStack.pop()!;
    this.historyStack.push(next);
    return this.applySnapshot(next, 'Redo operation performed');
  }

  public static rollbackToVersion(versionId: string): boolean {
    const target = ProjectManager.getProject().versions.find((v) => v.versionId === versionId);
    return target ? this.applySnapshot(target.snapshot, `Rollback to version ${versionId}`) : false;
  }

  private static applySnapshot(serialized: string, reason: string): boolean {
    try {
      const restored = JSON.parse(serialized) as MioProject;
      if (!restored || typeof restored !== 'object' || !restored.id || !Array.isArray(restored.assets)) return false;
      restored.lastModified = Date.now();
      restored.activityLog = Array.isArray(restored.activityLog) ? restored.activityLog : [];
      restored.activityLog.unshift({ timestamp: Date.now(), message: reason, mode: 'PROJECT' });
      ProjectManager.replaceProject(restored, reason);
      return true;
    } catch (err) {
      console.error('Failed to restore project snapshot:', err);
      return false;
    }
  }
}
