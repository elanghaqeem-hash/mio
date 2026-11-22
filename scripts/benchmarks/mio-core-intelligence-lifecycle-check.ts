import assert from 'node:assert/strict';
import { MioIntelligenceLifecycle } from '../../src/core/MioIntelligenceLifecycle';
import { emergencyStop } from '../../src/core/EmergencyStop';
try {
 emergencyStop.reset();
 assert.throws(()=>new MioIntelligenceLifecycle(0),/CAPACITY_INVALID/);
 const core=new MioIntelligenceLifecycle(2);
 try{
  assert.equal(core.inspect().state,'IDLE');
  const a=core.begin(),b=core.begin();
  assert.equal(a.privacy,'LOCAL_ONLY');assert.equal(a.mutationPermitted,false);
  assert.equal(core.inspect().active,2);
  assert.throws(()=>core.begin(),/ADMISSION_DENIED/);
  assert.equal(core.finish(Symbol()),false);
  assert.equal(core.finish(a.token),true);assert.equal(core.finish(a.token),false);
  emergencyStop.triggerEmergencyStop('CORE lifecycle test',{fromMainProcess:true});
  assert.equal(b.signal.aborted,true);assert.equal(core.finish(b.token),false);
  assert.equal(core.inspect().state,'STOPPED');assert.equal(core.inspect().active,0);
  assert.throws(()=>core.begin(),/ADMISSION_DENIED/);
  const stopped=new MioIntelligenceLifecycle();try{assert.equal(stopped.inspect().state,'STOPPED');}finally{stopped.dispose();}
  emergencyStop.reset();assert.throws(()=>core.begin(),/ADMISSION_DENIED/);
 }finally{core.dispose();}
 const fresh=new MioIntelligenceLifecycle();
 const c=fresh.begin();assert.equal(fresh.finish(c.token),true);assert.equal(fresh.inspect().state,'IDLE');
 const d=fresh.begin();fresh.dispose();assert.equal(d.signal.aborted,true);assert.equal(fresh.finish(d.token),false);
 assert.equal(fresh.inspect().state,'DISPOSED');
 console.log(JSON.stringify({stage:'M-1.02a',coreLifecycle:'pass',productionMutation:false}));
}finally{emergencyStop.reset();}
