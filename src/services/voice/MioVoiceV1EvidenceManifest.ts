import type { MioVoiceV1ProductionEvidence } from './MioVoiceV1ProductionAcceptance';
import { evaluateMioVoiceV1ProductionAcceptance } from './MioVoiceV1ProductionAcceptance';

export type MioVoiceEvidenceSource='ci'|'deployment'|'physical-device'|'operator';

export interface MioVoiceEvidenceRecord {
  key: keyof MioVoiceV1ProductionEvidence;
  verified: boolean;
  source: MioVoiceEvidenceSource;
  reference: string;
  verifiedAt: string;
}

export function buildMioVoiceV1Evidence(records:MioVoiceEvidenceRecord[]) {
 const keys:(keyof MioVoiceV1ProductionEvidence)[]=['rc1Candidate','productionEndpointVerified','providerAudioVerified','sessionBoundaryVerified','distributedRateLimitVerified','iosSafariVerified','desktopSafariVerified','chromiumVerified'];
 const evidence=Object.fromEntries(keys.map(k=>[k,records.some(r=>r.key===k&&r.verified&&r.reference.trim()&&r.verifiedAt.trim())])) as unknown as MioVoiceV1ProductionEvidence;
 return {evidence,acceptance:evaluateMioVoiceV1ProductionAcceptance(evidence),records};
}
