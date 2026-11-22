/** Trusted-main-only opt-in factory. Never expose dossiers through renderer IPC. */
import { NativeDesktopChatService } from './nativeLocalChat';
import { readNativeHardwareSnapshot, type LocalHardwareSnapshot } from './nativeHardwareAdmission';
import { reviewLocalCalibration, type LocalCalibrationReview } from '../../src/intelligence/model/MioLocalCalibrationGovernance';
/** Explicitly supply a reviewed dossier; no default activation or persistence. */
export function createReviewedNativeChatService(
 review:LocalCalibrationReview,
 opts?:{transport?:typeof fetch;timeoutMs?:number;hardware?:()=>LocalHardwareSnapshot;nowMs?:number}
):NativeDesktopChatService {
 const profile=reviewLocalCalibration(review,opts?.nowMs??Date.now());
 return new NativeDesktopChatService(opts?.transport??fetch,opts?.timeoutMs??120000,
  opts?.hardware??readNativeHardwareSnapshot,[profile]);
}
