import type { MioVoiceRc1EvidenceBundle } from './MioVoiceRc1EvidenceBundle';
import { evaluateMioVoiceRc1Evidence } from './MioVoiceRc1EvidenceBundle';

export interface MioVoiceRc1Signoff {
  release: 'blocked' | 'candidate';
  blockers: string[];
  generatedAt: string;
}

export function buildMioVoiceRc1Signoff(bundle:MioVoiceRc1EvidenceBundle):MioVoiceRc1Signoff {
 const result=evaluateMioVoiceRc1Evidence(bundle);
 const blockers=[...result.device.missing.map(v=>`missing-device:${v}`),...result.device.failed.map(v=>`failed-device:${v}`),...result.release.blockers];
 return {release:result.ready?'candidate':'blocked',blockers:[...new Set(blockers)],generatedAt:bundle.generatedAt};
}
