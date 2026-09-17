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

const CANDIDATE_CARD_SELECTOR = '.rounded-lg.border';
const FOCUS_CLASSES = ['ring-2', 'ring-cyan-500/50', 'ring-offset-2', 'ring-offset-[#07090e]'] as const;

export function lifecycleNavigationTargetForSurface(surface?: string): CandidateLifecycleNavigationTarget | undefined {
  if (!surface) return undefined;
  return SURFACE_LABEL_TO_TARGET[surface];
}

export function lifecycleSurfaceIdForLabel(surface?: string): string | undefined {
  const target = lifecycleNavigationTargetForSurface(surface);
  return target ? CANDIDATE_LIFECYCLE_SURFACE_IDS[target] : undefined;
}

export function selectUniqueCandidateTextIndex(texts: string[], runtimeModel?: string): number | undefined {
  const target = runtimeModel?.trim();
  if (!target) return undefined;
  const matches: number[] = [];
  for (let index = 0; index < texts.length; index++) {
    if (texts[index]?.includes(target)) matches.push(index);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function candidateFocusElement(surface: HTMLElement, runtimeModel?: string): HTMLElement | undefined {
  const cards = Array.from(surface.querySelectorAll<HTMLElement>(CANDIDATE_CARD_SELECTOR));
  const index = selectUniqueCandidateTextIndex(cards.map((card) => card.textContent ?? ''), runtimeModel);
  return index === undefined ? undefined : cards[index];
}

function highlightElement(element: HTMLElement, candidateId?: string): void {
  const previousTabIndex = element.getAttribute('tabindex');
  const previousCandidate = element.getAttribute('data-mio-navigation-focus-candidate');
  element.setAttribute('tabindex', '-1');
  if (candidateId?.trim()) element.setAttribute('data-mio-navigation-focus-candidate', candidateId.trim().slice(0, 180));
  element.focus({ preventScroll: true });
  element.classList.add(...FOCUS_CLASSES);

  globalThis.setTimeout(() => {
    element.classList.remove(...FOCUS_CLASSES);
    if (previousTabIndex === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', previousTabIndex);
    if (previousCandidate === null) element.removeAttribute('data-mio-navigation-focus-candidate');
    else element.setAttribute('data-mio-navigation-focus-candidate', previousCandidate);
  }, 1800);
}

export function navigateToCandidateLifecycleSurface(
  surface?: string,
  candidateId?: string,
  runtimeModel?: string,
): boolean {
  if (typeof document === 'undefined') return false;
  const id = lifecycleSurfaceIdForLabel(surface);
  if (!id) return false;
  const surfaceElement = document.getElementById(id);
  if (!surfaceElement) return false;

  const focusElement = candidateFocusElement(surfaceElement, runtimeModel) ?? surfaceElement;
  focusElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightElement(focusElement, candidateId);
  return true;
}
