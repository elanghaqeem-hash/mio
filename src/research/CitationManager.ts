import { RawResearchResult } from '../types/research';

export class CitationManager {
  public static label(source: RawResearchResult, index: number): string {
    const author = source.authors?.[0];
    const year = source.publishedAt?.slice(0, 4);
    if (author && year) return `[${index + 1}] ${author} (${year})`;
    return `[${index + 1}] ${source.title}`;
  }
}
