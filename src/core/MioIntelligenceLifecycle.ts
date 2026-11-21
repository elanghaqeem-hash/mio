/** Local-only intelligence lifecycle; no tools, mutations, or provider calls. */
import { emergencyStop } from './EmergencyStop';
export type IntelligenceState='IDLE'|'RUNNING'|'STOPPED'|'DISPOSED';
export class MioIntelligenceLifecycle {
 private state:IntelligenceState='IDLE';
 private active=new Map<symbol,AbortController>();
 private readonly detach:()=>void;
 constructor(private readonly capacity=4){
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>32)throw Error('MIO_CORE_CAPACITY_INVALID');
  this.detach=emergencyStop.registerAbortHandler(()=>this.stop());
  if(emergencyStop.isEmergencyStopped())this.stop();
 }
 begin(){
  if(emergencyStop.isEmergencyStopped())this.stop();
  if(this.state==='STOPPED'||this.state==='DISPOSED'||this.active.size>=this.capacity)throw Error('MIO_CORE_ADMISSION_DENIED');
  const token=Symbol('intelligence-task'),controller=new AbortController();
  this.active.set(token,controller);this.state='RUNNING';
  return {token,signal:controller.signal,privacy:'LOCAL_ONLY' as const,mutationPermitted:false as const};
 }
 finish(token:symbol):boolean {
  if(emergencyStop.isEmergencyStopped())this.stop();
  if(this.state!=='RUNNING'||!this.active.has(token))return false;
  this.active.delete(token);
  if(!this.active.size)this.state='IDLE';
  return true;
 }
 stop(){
  if(this.state==='DISPOSED'||this.state==='STOPPED')return;
  this.state='STOPPED';
  const controllers=[...this.active.values()];this.active.clear();
  for(const c of controllers)c.abort();
 }
 dispose(){this.stop();this.state='DISPOSED';this.detach();}
 inspect(){return {state:this.state,active:this.active.size,capacity:this.capacity,mutationPermitted:false as const};}
}
