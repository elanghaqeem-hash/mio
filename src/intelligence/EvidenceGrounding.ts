import type { ApplicationContextEnvelope, ApplicationContextSource } from '../types/models';

export type EvidenceClaimStatus = 'SUPPORTED' | 'INFERENCE' | 'UNSUPPORTED';

export interface EvidenceReference {
  assetId: string;
  label: string;
  sourceUri: string;
  trust: ApplicationContextSource['trust'];
  freshness: ApplicationContextSource['freshness'];
  overlapTerms: string[];
  excerpt: string;
}

export interface EvidenceClaim {
  text: string;
  status: EvidenceClaimStatus;
  evidence: EvidenceReference[];
}

export interface EvidenceAudit {
  claims: EvidenceClaim[];
  supported: number;
  inference: number;
  unsupported: number;
  method: 'LEXICAL_EVIDENCE_HEURISTIC';
}

const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'will', 'your', 'yang', 'dan', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'adalah', 'akan', 'atau']);
const MAX_EVIDENCE_EXCERPT_CHARS = 260;

function terms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_-]{4,}/g) ?? [])].filter((term) => !STOP.has(term));
}

function sentenceLike(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .slice(0, 24);
}

function evidenceExcerpt(sourceText: string, overlapTerms: string[]): string {
  const normalized = sourceText.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_EVIDENCE_EXCERPT_CHARS) return normalized;
  const lower = normalized.toLowerCase();
  const firstMatch = overlapTerms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstMatch - 80);
  const end = Math.min(normalized.length, start + MAX_EVIDENCE_EXCERPT_CHARS);
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`;
}

function referenceFor(source: ApplicationContextSource, overlapTerms: string[]): EvidenceReference {
  return {
    assetId: source.assetId,
    label: source.label,
    sourceUri: source.sourceUri,
    trust: source.trust,
    freshness: source.freshness,
    overlapTerms,
    excerpt: evidenceExcerpt(source.text, overlapTerms),
  };
}

export class EvidenceGrounding {
  public static audit(responseText: string, context?: ApplicationContextEnvelope): EvidenceAudit {
    const claims = sentenceLike(responseText).map((claim): EvidenceClaim => {
      const claimTerms = terms(claim);
      if (!context || context.sources.length === 0 || claimTerms.length === 0) {
        return { text: claim, status: 'UNSUPPORTED', evidence: [] };
      }

      const candidates = context.sources
        .map((source) => {
          const sourceTerms = new Set(terms(source.text));
          const overlap = claimTerms.filter((term) => sourceTerms.has(term));
          return { source, overlap };
        })
        .filter((candidate) => candidate.overlap.length > 0)
        .sort((a, b) => b.overlap.length - a.overlap.length)
        .slice(0, 3);

      const bestOverlap = candidates[0]?.overlap.length ?? 0;
      const evidence = candidates.map((candidate) => referenceFor(candidate.source, candidate.overlap));
      const status: EvidenceClaimStatus = bestOverlap >= 2 ? 'SUPPORTED' : bestOverlap === 1 ? 'INFERENCE' : 'UNSUPPORTED';
      return { text: claim, status, evidence };
    });

    return {
      claims,
      supported: claims.filter((claim) => claim.status === 'SUPPORTED').length,
      inference: claims.filter((claim) => claim.status === 'INFERENCE').length,
      unsupported: claims.filter((claim) => claim.status === 'UNSUPPORTED').length,
      method: 'LEXICAL_EVIDENCE_HEURISTIC',
    };
  }
}
