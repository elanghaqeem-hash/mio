import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { FeedbackCollector } from '../training/FeedbackCollector';
import { MioBenchRunner, scoreMioBenchCase } from '../training/MioBench';
import { exportEligibleTrainingJsonl, isTrainingEligible, MioTrainingExample, validateTrainingExample } from '../training/TrainingDataset';
import { ModelProvider } from '../types/models';

export async function runTrainingFoundationTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const assert = (condition: boolean, name: string) => {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ [PASS] ${name}`);
    } else {
      console.error(`✗ [FAIL] ${name}`);
    }
  };

  const approved: MioTrainingExample = {
    schemaVersion: 1,
    id: 'seed:router-001',
    domain: 'GENERAL',
    language: 'id',
    messages: [
      { role: 'user', content: 'Apa fungsi model router?' },
      { role: 'assistant', content: 'Model router memilih provider dan model sesuai kebutuhan tugas dan kebijakan.' },
    ],
    provenance: { kind: 'CURATED', createdAt: 1 },
    eligibility: { trainingApproved: true, privacyReviewed: true, copyrightReviewed: true },
    quality: { factuality: 5, instructionFollowing: 5, safety: 5 },
  };
  assert(validateTrainingExample(approved).valid, 'Governed curated example validates');
  assert(isTrainingEligible(approved), 'Approved high-quality example becomes training eligible');
  assert(exportEligibleTrainingJsonl([approved]).includes('seed:router-001'), 'Eligible exporter includes approved example');

  const unreviewedUserData: MioTrainingExample = {
    ...approved,
    id: 'feedback:unsafe-001',
    provenance: { kind: 'USER_CONTRIBUTED', createdAt: 2 },
    eligibility: { trainingApproved: true, privacyReviewed: false, copyrightReviewed: true },
  };
  assert(!validateTrainingExample(unreviewedUserData).valid && !isTrainingEligible(unreviewedUserData), 'Unreviewed user-contributed data is rejected');
  assert(!exportEligibleTrainingJsonl([unreviewedUserData]).trim(), 'Ineligible data is excluded from training export');

  const storage = new InMemoryStorageProvider();
  const collector = new FeedbackCollector(storage);
  await collector.record({
    id: 'fb-no-consent', requestId: 'r1', provider: 'mio_local', model: 'qwen3:8b', rating: 'CORRECTED',
    createdAt: 3, prompt: 'Question', response: 'Wrong', correction: 'Correct', trainingConsent: false, privacyReviewed: true,
  });
  assert((await collector.toTrainingCandidate('fb-no-consent')) === undefined, 'Feedback without explicit training consent cannot become a candidate');

  await collector.record({
    id: 'fb-consented', requestId: 'r2', provider: 'mio_local', model: 'qwen3:8b', rating: 'CORRECTED',
    createdAt: 4, prompt: 'Question', response: 'Wrong', correction: 'Correct', trainingConsent: true, privacyReviewed: true,
  });
  const candidate = await collector.toTrainingCandidate('fb-consented', 'en');
  assert(candidate?.provenance.kind === 'USER_CONTRIBUTED', 'Consented corrected feedback can become a governed candidate');
  assert(candidate?.eligibility.trainingApproved === false && candidate !== undefined && !isTrainingEligible(candidate), 'Feedback candidate still requires approval and quality review');

  const failedScore = scoreMioBenchCase({ id: 'bench-fail', domain: 'REASONING', prompt: 'x', requiredPhrases: ['expected'] }, 'different');
  assert(!failedScore.passed && failedScore.failures.length === 1, 'MioBench reports deterministic requirement failures');

  const fakeProvider: ModelProvider = {
    id: 'local_heuristic',
    displayName: 'Benchmark Fake',
    requiresNetwork: false,
    requiresProxy: false,
    async generate() {
      return {
        provider: 'local_heuristic', model: 'fake-v1', text: 'The correct result is 282 and failed HTTP fetches should check response.ok.',
        generatedAt: Date.now(), source: 'LOCAL',
      };
    },
  };
  const report = await new MioBenchRunner([
    { id: 'math', domain: 'REASONING', prompt: 'math', requiredPhrases: ['282'] },
    { id: 'fetch', domain: 'CODING', prompt: 'fetch', requiredPhrases: ['response.ok'] },
  ]).run(fakeProvider);
  assert(report.passRate === 1 && report.score === report.maxScore, 'MioBenchRunner aggregates provider regression results');

  return { passed, total };
}
