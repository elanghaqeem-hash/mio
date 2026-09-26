import type { MioVoiceAcceptanceCase } from './MioVoiceAcceptanceMatrix';
import { evaluateMioVoiceAcceptanceMatrix } from './MioVoiceAcceptanceMatrix';
import { evaluateMioVoiceRc1Gate, type MioVoiceRc1GateInput } from './MioVoiceRc1ReleaseGate';

export interface MioVoiceRc1EvidenceBundle {
  generatedAt: string;
  devices: MioVoiceAcceptanceCase[];
  runtime: Omit<MioVoiceRc1GateInput,'deviceValidationPassed'>;
}

export function evaluateMioVoiceRc1Evidence(bundle:MioVoiceRc1EvidenceBundle) {
  const device=evaluateMioVoiceAcceptanceMatrix(bundle.devices);
  const release=evaluateMioVoiceRc1Gate({...bundle.runtime,deviceValidationPassed:device.ready});
  return {ready:release.ready,device,release,generatedAt:bundle.generatedAt};
}
