import { EvidenceGrounding } from '../intelligence/EvidenceGrounding';
import { EvidencePackageBuilder } from '../project/EvidencePackage';
import { ProjectKnowledgeIndex } from '../project/ProjectKnowledgeIndex';
import type { MioProject } from '../types/project';

interface TestResult { name: string; passed: boolean; error?: string }
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
async function test(name: string, fn: () => void | Promise<void>): Promise<TestResult> { try { await fn(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }

function projectFixture(): MioProject {
  const now = Date.now();
  return {
    id: 'evidence_project', name: 'Evidence Project', description: 'Evidence package fixture', activeMode: 'CHAT', createdAt: now, updatedAt: now,
    assets: [
      { id: 'source_a', name: 'BCM Policy', type: 'document', origin: 'user', version: 1, verified: true, createdAt: now, updatedAt: now, filePath: 'workspace://evidence/bcm-policy.md', data: { content: 'Business continuity recovery target is four hours for critical payment processing. Recovery exercises are performed every quarter.' } },
      { id: 'source_b', name: 'BCM Review', type: 'document', origin: 'research', version: 1, verified: false, createdAt: now, updatedAt: now, filePath: 'research://example/bcm-review', data: { content: 'Critical payment processing recovery target is six hours according to the external review.', security: { suspicious: false, detectedThreats: [] } } },
    ],
    versions: [],
    knowledgeGovernance: {
      sources: {
        source_a: { assetId: 'source_a', included: true, trust: 'VERIFIED', freshUntil: now + 86_400_000, priority: 'PRIMARY', upstreamSourceKey: 'policy-master' },
        source_b: { assetId: 'source_b', included: true, trust: 'QUARANTINED', priority: 'STANDARD', upstreamSourceKey: 'external-review' },
      },
      history: [
        { id: 'gov_1', assetId: 'source_a', action: 'REVIEWED', timestamp: now - 1000, actor: 'USER', trust: 'VERIFIED', note: 'Approved for project use' },
      ],
      corroborationGroups: [],
      conflictResolutions: [],
    },
  };
}

export async function runEvidencePackageTests(): Promise<{ passed: number; total: number }> {
  const results: TestResult[] = [];
  const project = projectFixture();
  const context = ProjectKnowledgeIndex.retrieve(project, 'critical payment recovery target', { contextBudgetChars: 4800 });
  const response = 'Critical payment recovery target is four hours. The external review states six hours.';
  const audit = EvidenceGrounding.audit(response, context.applicationContext);
  const pkg = EvidencePackageBuilder.build({ project, query: 'critical payment recovery target', responseText: response, projectContext: context, evidenceAudit: audit, createdAt: 1234567890 });

  results.push(await test('Evidence package declares stable schema and DATA_ONLY audit disclosures', () => {
    assert(pkg.schemaVersion === 'MIO_EVIDENCE_PACKAGE_V1', 'schema mismatch');
    assert(pkg.disclosures.some((item) => item.includes('does not contain private chain-of-thought')), 'chain-of-thought disclosure missing');
  }));
  results.push(await test('Evidence package snapshots selected source governance and ranking components', () => {
    assert(pkg.sources.length >= 1, 'expected selected sources');
    assert(pkg.sources.every((source) => typeof source.lexicalScore === 'number' && typeof source.finalScore === 'number'), 'ranking decomposition missing');
    assert(pkg.sources.some((source) => source.trust === 'VERIFIED'), 'trust snapshot missing');
  }));
  results.push(await test('Evidence package includes transparent retrieval diagnostics', () => {
    assert(pkg.retrieval.method === 'TRANSPARENT_RETRIEVAL_DIAGNOSTIC', 'diagnostic method missing');
    assert(pkg.retrieval.selectedSourceCount >= 1, 'selected source count missing');
  }));
  results.push(await test('Evidence package carries bounded evidence audit rather than hidden reasoning', () => {
    assert(pkg.evidenceAudit?.method === 'LEXICAL_EVIDENCE_HEURISTIC', 'evidence method missing');
    assert((pkg.evidenceAudit?.claims.length ?? 0) > 0, 'claim audit missing');
  }));
  results.push(await test('Evidence package captures relevant conflict review signals without truth claim', () => {
    assert(pkg.conflicts.length >= 1, 'expected potential conflict snapshot');
    assert(pkg.disclosures.some((item) => item.includes('not a general truth guarantee')), 'truthfulness disclosure missing');
  }));
  results.push(await test('Evidence package contains persisted source provenance timeline', () => {
    assert(pkg.provenance.some((event) => event.assetId === 'source_a' && event.action === 'REVIEWED'), 'provenance event missing');
  }));
  results.push(await test('Evidence package deterministic fingerprint verifies unchanged snapshot', () => {
    assert(EvidencePackageBuilder.verify(pkg), 'fresh package should verify');
    assert(pkg.integrity.method === 'FNV1A32_CANONICAL_JSON_NON_CRYPTOGRAPHIC', 'fingerprint method must be explicit');
  }));
  results.push(await test('Evidence package fingerprint detects ordinary serialized snapshot tampering', () => {
    const tampered = JSON.parse(EvidencePackageBuilder.serialize(pkg)) as typeof pkg;
    tampered.responseText = `${tampered.responseText} tampered`;
    assert(!EvidencePackageBuilder.verify(tampered), 'tampered package should fail verification');
  }));
  results.push(await test('Evidence package serialization does not invent chain-of-thought fields', () => {
    const serialized = EvidencePackageBuilder.serialize(pkg).toLowerCase();
    assert(!serialized.includes('chainofthought'), 'unexpected chainOfThought field');
    assert(!serialized.includes('hiddenreasoning'), 'unexpected hiddenReasoning field');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((result) => result.passed).length, total: results.length };
}
