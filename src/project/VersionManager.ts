import { MioProject, ProjectVersion } from '../types/project';
import { ProjectManager } from './ProjectManager';
import { eventBus } from '../core/EventBus';

export class VersionManager {
  private static historyStack: string[] = [];
  private static redoStack: string[] = [];
  private static maxSnapshots = 20;

  public static takeSnapshot(description: string = 'Snapshot taken'): void {
    const project = ProjectManager.getProject();
    const serialized = JSON.stringify(project);

    this.historyStack.push(serialized);
    if (this.historyStack.length > this.maxSnapshots) {
      this.historyStack.shift();
    }
    this.redoStack = [];

    const versionItem: ProjectVersion = {
      versionId: `ver_${Date.now()}`,
      timestamp: Date.now(),
      description,
      snapshot: serialized,
    };
    project.versions.unshift(versionItem);
    eventBus.emit('VERSION_SNAPSHOT_TAKEN', versionItem);
    ProjectManager.commitProjectUpdate(`Created project snapshot: ${description}`);
  }

  public static undo(): boolean {
    if (this.historyStack.length <= 1) return false;

    const current = this.historyStack.pop()!;
    this.redoStack.push(current);

    const previous = this.historyStack[this.historyStack.length - 1];
    if (!previous) return false;
    this.applySnapshot(previous, 'Undo operation performed');
    return true;
  }

  public static redo(): boolean {
    if (this.redoStack.length === 0) return false;

    const next = this.redoStack.pop()!;
    this.historyStack.push(next);
    this.applySnapshot(next, 'Redo operation performed');
    return true;
  }

  public static rollbackToVersion(versionId: string): boolean {
    const project = ProjectManager.getProject();
    const target = project.versions.find((version) => version.versionId === versionId);
    if (!target) return false;

    this.applySnapshot(target.snapshot, `Rollback to version ${versionId}`);
    return true;
  }

  private static applySnapshot(serialized: string, reason: string): void {
    try {
      const restored: MioProject = JSON.parse(serialized);
      ProjectManager.replaceProject(restored, reason);
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
    }
  }
}
