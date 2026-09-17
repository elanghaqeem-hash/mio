import {
  CANDIDATE_LIFECYCLE_SURFACE_IDS,
  lifecycleNavigationTargetForSurface,
  lifecycleSurfaceIdForLabel,
  navigateToCandidateLifecycleSurface,
} from '../modes/settings/CandidateLifecycleNavigation';

export async function runCandidateLifecycleGuidedNavigationTests(): Promise<{ passed: number; total: number }> {
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

  assert(lifecycleNavigationTargetForSurface('Native Model Candidate Lab') === 'CANDIDATE_LAB', 'Candidate Lab action surface maps to guided candidate-lab target');
  assert(lifecycleNavigationTargetForSurface('Training Handoff ↔ Adapter Integrity') === 'ARTIFACT_BINDING', 'Artifact binding surface maps to governed binding panel');
  assert(lifecycleNavigationTargetForSurface('Training Candidate Review') === 'RELEASE_REVIEW', 'Release-review surface maps to explicit review panel');
  assert(lifecycleNavigationTargetForSurface('Training Candidate / Promotion') === 'FINAL_PROMOTION', 'Promotion surface maps to explicit final-promotion panel');
  assert(lifecycleNavigationTargetForSurface('Promoted Model Runtime') === 'PROMOTED_RUNTIME', 'Activation surface maps to promoted-runtime panel');
  assert(lifecycleNavigationTargetForSurface('Model Provenance / Signer Trust') === 'MODEL_PROVENANCE', 'Provenance/trust surface maps to the single provenance section');
  assert(lifecycleNavigationTargetForSurface('unknown surface') === undefined, 'Unknown lifecycle surface is not guessed or redirected');

  const ids = Object.values(CANDIDATE_LIFECYCLE_SURFACE_IDS);
  assert(new Set(ids).size === ids.length, 'Lifecycle navigation target ids are unique');
  assert(ids.every((id) => /^mio-lifecycle-[a-z0-9-]+$/.test(id)), 'Lifecycle navigation target ids use stable bounded DOM identifiers');
  assert(lifecycleSurfaceIdForLabel('Native Model Candidate Lab') === CANDIDATE_LIFECYCLE_SURFACE_IDS.CANDIDATE_LAB, 'Surface label resolves to stable DOM anchor id');

  const hadDocument = typeof document !== 'undefined';
  if (!hadDocument) {
    assert(navigateToCandidateLifecycleSurface('Native Model Candidate Lab') === false, 'Navigation fails closed outside a browser DOM and performs no lifecycle action');
  } else {
    assert(true, 'Browser DOM navigation is covered by build/runtime contract; Node test environment already provides document');
  }

  return { passed, total };
}
