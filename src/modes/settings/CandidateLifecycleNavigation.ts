export type CandidateLifecycleNavigationTarget =
  | 'CANDIDATE_LAB'
  | 'ARTIFACT_BINDING'
  | 'MODEL_PROVENANCE'
  | 'RELEASE_REVIEW'
  | 'FINAL_PROMOTION'
  | 'PROMOTED_RUNTIME';

export const CANDIDATE_LIFECYCLE_SURFACE_IDS: Record<CandidateLifecycleNavigationTarget, string> = {
  CANDIDATE_LAB: 'mio-lifecycle-candidate-lab',
  ARTIFACT_BINDING: 'mio-lifecycle-artifact-binding',
  MODEL_PROVENANCE: 'mio-lifecycle-model-provenance',
  RELEASE_REVIEW: 'mio-lifecycle-release-review',
  FINAL_PROMOTION: 'mio-lifecycle-final-promotion',
  PROMOTED_RUNTIME: 'mio-lifecycle-promoted-runtime',
};

const SURFACE_LABEL_TO_TARGET: Record<string, CandidateLifecycleNavigationTarget> = {
  'Native Model Candidate Lab': 'CANDIDATE_LAB',
  'Training Handoff ↔ Adapter Integrity': 'ARTIFACT_BINDING',
  'Model Provenance': 'MODEL_PROVENANCE',
  'Model Provenance / Signer Trust': 'MODEL_PROVENANCE',
  'Training Candidate Review': 'RELEASE_REVIEW',
  'Training Candidate / Promotion': 'FINAL_PROMOTION',
  'Promoted Model Runtime': 'PROMOTED_RUNTIME',
};

export function lifecycleNavigationTargetForSurface(surface?: string): CandidateLifecycleNavigationTarget | undefined {
  if (!surface) return undefined;
  return SURFACE_LABEL_TO_TARGET[surface];
}

export function lifecycleSurfaceIdForLabel(surface?: string): string | undefined {
  const target = lifecycleNavigationTargetForSurface(surface);
  return target ? CANDIDATE_LIFECYCLE_SURFACE_IDS[target] : undefined;
}

export function navigateToCandidateLifecycleSurface(surface?: string): boolean {
  if (typeof document === 'undefined') return false;
  const id = lifecycleSurfaceIdForLabel(surface);
  if (!id) return false;
  const element = document.getElementById(id);
  if (!element) return false;

  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const previousTabIndex = element.getAttribute('tabindex');
  element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
  element.classList.add('ring-2', 'ring-cyan-500/50', 'ring-offset-2', 'ring-offset-[#07090e]');

  globalThis.setTimeout(() => {
    element.classList.remove('ring-2', 'ring-cyan-500/50', 'ring-offset-2', 'ring-offset-[#07090e]');
    if (previousTabIndex === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', previousTabIndex);
  }, 1600);
  return true;
}
