/** Node-side diagnostic composition only; not Electron IPC or production admission. */
import { emergencyStop } from '../core/EmergencyStop';
import type { WindowsJournalIncidentRegistry } from './WindowsJournalIncidentRegistry';
import type { WindowsJournalIncidentStorage } from './WindowsJournalIncidentStorage';
export function bindIncidentEmergencyStop(registry:WindowsJournalIncidentRegistry,storage:WindowsJournalIncidentStorage){
 let stopped=false;
 const stop=()=>{
  if(stopped)return;
  stopped=true;
  try{registry.stop();}finally{storage.stop();}
 };
 const detach=emergencyStop.registerAbortHandler(stop);
 if(emergencyStop.isEmergencyStopped())stop();
 return {
  isStopped:()=>stopped,
  // Disposal is terminal; a detached service may not continue operating.
  dispose(){try{stop();}finally{detach();}},
  runtimeActivationPermitted:false as const,
 };
}
