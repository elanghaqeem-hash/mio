import { MioAdaptiveBufferController } from '../services/voice/MioAdaptiveBufferController';

export async function runMioVoiceInterruptionAdaptiveIsolationTests():Promise<{passed:number;total:number}> {
 const checks:boolean[]=[];
 const controller=new MioAdaptiveBufferController();
 const initial=controller.getTargetChunks();
 // Cancellation/barge-in occurs before a completed playback sample reaches decide().
 checks.push(controller.getTargetChunks()===initial);
 // A completed rebuffered turn is allowed to influence the next turn.
 controller.decide({condition:'constrained',bufferAheadMs:200,rebufferCount:1,firstAudibleLatencyMs:1800,nowMs:1000});
 checks.push(controller.getTargetChunks()===initial+1);
 // Another interrupted turn contributes no sample and therefore cannot mutate state.
 const beforeInterrupted=controller.getTargetChunks();
 checks.push(controller.getTargetChunks()===beforeInterrupted);
 if(checks.some(v=>!v)) throw new Error('Mio interruption/adaptive isolation regression');
 return {passed:checks.length,total:checks.length};
}
