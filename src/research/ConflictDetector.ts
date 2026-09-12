import { ResearchConflict, ResearchSource } from '../types/research';

export class ConflictDetector {
  public static detect(sources: ResearchSource[]): ResearchConflict[] {
    const conflicts: ResearchConflict[] = [];
    const byTitle = new Map<string, ResearchSource[]>();

    for (const source of sources) {
      const key = source.title.trim().toLowerCase().replace(/\s+/g, ' ');
      const group = byTitle.get(key) ?? [];
      group.push(source);
      byTitle.set(key, group);
    }

    for (const [title, group] of byTitle.entries()) {
      if (group.length < 2) continue;
      const normalizedExcerpts = new Set(group.map((item) => item.sanitizedExcerpt.trim().toLowerCase()));
      if (normalizedExcerpts.size > 1) {
        conflicts.push({
          id: `conflict_${conflicts.length + 1}`,
          sourceIds: group.map((item) => item.id),
          description: `Sources with matching title "${title}" contain materially different excerpts and require review.`,
          severity: 'WARNING',
        });
      }
    }

    return conflicts;
  }
}
