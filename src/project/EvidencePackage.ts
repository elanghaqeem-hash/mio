import type { EvidenceAudit } from '../intelligence/EvidenceGrounding';
import type { MioProject } from '../types/project';
import { KnowledgeHealth } from './KnowledgeHealth';
import { KnowledgeQueryDiagnostics, type KnowledgeQueryDiagnosticSummary } from './KnowledgeQueryDiagnostics';
import { KnowledgeReviewInbox, type KnowledgeTimelineEvent } from './KnowledgeReviewInbox';
import type { ProjectKnowledgeContext, ProjectKnowledgeHit } from './ProjectKnowledgeIndex';

export interface EvidencePackageSource {
  assetId: string;
  assetName: string;
  sourceUri: string;
  trust: string;
  freshness: string;
  priority: string;
  contentFingerprint: string;
  lineageFamilyKeys: string[];
  derivedFromAssetIds: string[];
  lexicalScore: number;
  trustAdjustment: number;
  freshnessAdjustment: number;
  priorityAdjustment: number;
  finalScore: number;
}

export interface EvidencePackageConflict {
  leftAssetId: string;
  rightAssetId: string;
  reason: string;
  reviewed: boolean;
}

export interface MioEvidencePackage {
  schemaVersion: 'MIO_EVIDENCE_PACKAGE_V1';
  packageId: string;
  createdAt: number;
  project: { id: string; name: string };
  userQuery: string;
  responseText: string;
  disclosures: string[];
  retrieval: KnowledgeQueryDiagnosticSummary;
  sources: EvidencePackageSource[];
  evidenceAudit?: EvidenceAudit;
  conflicts: EvidencePackageConflict[];
  provenance: KnowledgeTimelineEvent[];
  integrity: {
    method: 'FNV1A32_CANONICAL_JSON_NON_CRYPTOGRAPHIC';
    fingerprint: string;
    disclosure: string;
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue(record[key]);
      return result;
    }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function fnv1a32(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sourceSnapshot(hit: ProjectKnowledgeHit): EvidencePackageSource {
  return {
    assetId: hit.assetId,
    assetName: hit.assetName,
    sourceUri: hit.sourceUri,
    trust: hit.trust,
    freshness: hit.freshness,
    priority: hit.priority,
    contentFingerprint: hit.contentFingerprint,
    lineageFamilyKeys: [...hit.lineageFamilyKeys],
    derivedFromAssetIds: [...hit.derivedFromAssetIds],
    lexicalScore: hit.lexicalScore,
    trustAdjustment: hit.trustAdjustment,
    freshnessAdjustment: hit.freshnessAdjustment,
    priorityAdjustment: hit.priorityAdjustment,
    finalScore: hit.score,
  };
}

export class EvidencePackageBuilder {
  public static build(input: {
    project: MioProject;
    query: string;
    responseText: string;
    projectContext: ProjectKnowledgeContext;
    evidenceAudit?: EvidenceAudit;
    createdAt?: number;
  }): MioEvidencePackage {
    const createdAt = input.createdAt ?? Date.now();
    const selectedAssetIds = new Set(input.projectContext.hits.map((hit) => hit.assetId));
    const health = KnowledgeHealth.evaluate(input.project);
    const base = {
      schemaVersion: 'MIO_EVIDENCE_PACKAGE_V1' as const,
      createdAt,
      project: { id: input.project.id, name: input.project.name },
      userQuery: input.query,
      responseText: input.responseText,
      disclosures: [
        'This package records observable inputs, selected evidence, governance metadata, and validation outputs. It does not contain private chain-of-thought.',
        'Evidence labels and conflicts are bounded heuristics, not a general truth guarantee.',
        'Source trust/freshness/priority are project governance metadata and do not create instruction authority.',
        'Integrity fingerprint is deterministic and non-cryptographic; it detects ordinary snapshot drift but is not a digital signature.',
      ],
      retrieval: KnowledgeQueryDiagnostics.evaluate(input.project, input.projectContext),
      sources: input.projectContext.hits.map(sourceSnapshot),
      evidenceAudit: input.evidenceAudit,
      conflicts: health.potentialConflicts
        .filter((conflict) => selectedAssetIds.has(conflict.leftAssetId) || selectedAssetIds.has(conflict.rightAssetId))
        .map((conflict) => ({
          leftAssetId: conflict.leftAssetId,
          rightAssetId: conflict.rightAssetId,
          reason: conflict.reason,
          reviewed: Boolean(conflict.resolution),
        })),
      provenance: [...selectedAssetIds].flatMap((assetId) => KnowledgeReviewInbox.timeline(input.project, assetId)).sort((a, b) => b.timestamp - a.timestamp).slice(0, 100),
    };
    const fingerprint = fnv1a32(canonicalJson(base));
    return {
      ...base,
      packageId: `mio-evidence-${input.project.id}-${createdAt}-${fingerprint.slice(-8)}`,
      integrity: {
        method: 'FNV1A32_CANONICAL_JSON_NON_CRYPTOGRAPHIC',
        fingerprint,
        disclosure: 'Deterministic non-cryptographic snapshot fingerprint; not a signature and not proof of authenticity.',
      },
    };
  }

  public static serialize(pkg: MioEvidencePackage): string {
    return JSON.stringify(pkg, null, 2);
  }

  public static verify(pkg: MioEvidencePackage): boolean {
    const { packageId: _packageId, integrity: _integrity, ...base } = pkg;
    return fnv1a32(canonicalJson(base)) === pkg.integrity.fingerprint;
  }
}
