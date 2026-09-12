import React, { useState } from 'react';
import { Shield, FolderCheck, Sliders, Database, CheckCircle2, ArrowRight, ArrowLeft, PlugZap } from 'lucide-react';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';

interface FirstRunWizardProps { onComplete: () => void; }

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const totalSteps = 6;
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState('ASSISTIVE');
  const [network, setNetwork] = useState('OFFLINE');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [error, setError] = useState('');

  const chooseWorkspace = async () => {
    try { setWorkspace(await window.mioDesktop?.selectDirectory() || null); } catch (err: any) { setError(err?.message || String(err)); }
  };

  const finish = async () => {
    if (!window.mioDesktop) { setError('Desktop runtime is unavailable. Setup cannot be persisted safely.'); return; }
    await Promise.all([
      window.mioDesktop.setSetting('setup.completed', true),
      window.mioDesktop.setSetting('system.autonomy', autonomy),
      window.mioDesktop.setSetting('system.network', network),
      window.mioDesktop.setSetting('memory.enabled', memoryEnabled),
    ]);
    onComplete();
  };

  const next = async () => { if (step < totalSteps) setStep(step + 1); else await finish(); };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 font-mono text-xs select-none">
    <div className="bg-[#0b101d] border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-8 shadow-2xl shadow-cyan-950/60">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6"><div className="flex items-center gap-3"><MioCoreVisualizer state="PROCESSING" size={38} interactive={false}/><div><h2 className="text-base font-bold text-white tracking-wider">MIO V2 // SECURE FIRST-RUN SETUP</h2><span className="text-[10px] text-cyan-400">Step {step} of {totalSteps}</span></div></div><div className="w-32 bg-gray-800 h-1.5 rounded-full overflow-hidden"><div className="bg-cyan-400 h-full" style={{width:`${step/totalSteps*100}%`}}/></div></div>
      {error && <div className="mb-4 p-3 rounded border border-red-500/30 bg-red-950/30 text-red-300">{error}</div>}
      <div className="min-h-[260px] flex flex-col justify-center">
        {step === 1 && <div className="space-y-3 text-center"><Shield className="mx-auto text-cyan-400"/><h3 className="text-lg font-bold text-cyan-300">Secure local-first initialization</h3><p className="text-gray-300 text-sm">MIO starts offline, denies privileged operations by default, and stores application state in its local SQLite database. External AI is optional and must be configured and tested explicitly.</p></div>}
        {step === 2 && <div className="space-y-3"><h3 className="font-bold text-cyan-300 flex gap-2"><FolderCheck size={16}/> Authorized Workspace</h3><p className="text-gray-400">File operations are blocked until you explicitly select a workspace. MIO cannot access paths outside this boundary through its filesystem bridge.</p><button onClick={chooseWorkspace} className="w-full p-3 rounded bg-cyan-950 border border-cyan-500 text-cyan-300">{workspace ? `WORKSPACE: ${workspace}` : 'SELECT WORKSPACE'}</button></div>}
        {step === 3 && <div className="space-y-3"><h3 className="font-bold text-cyan-300 flex gap-2"><Sliders size={16}/> Autonomy</h3><div className="grid grid-cols-2 gap-2">{['PASSIVE','ASSISTIVE','PROACTIVE','AUTONOMOUS'].map(x=><button key={x} onClick={()=>setAutonomy(x)} className={`p-3 rounded border ${autonomy===x?'border-cyan-500 bg-cyan-950 text-cyan-300':'border-gray-800 text-gray-400'}`}>{x}</button>)}</div><p className="text-amber-300 text-[10px]">L4/L5 privileged actions still require explicit confirmation regardless of autonomy level.</p></div>}
        {step === 4 && <div className="space-y-3"><h3 className="font-bold text-cyan-300 flex gap-2"><PlugZap size={16}/> Network & AI</h3><div className="grid grid-cols-2 gap-2"><button onClick={()=>setNetwork('OFFLINE')} className={`p-3 rounded border ${network==='OFFLINE'?'border-cyan-500 bg-cyan-950 text-cyan-300':'border-gray-800 text-gray-400'}`}>OFFLINE DEFAULT</button><button onClick={()=>setNetwork('ONLINE')} className={`p-3 rounded border ${network==='ONLINE'?'border-emerald-500 bg-emerald-950 text-emerald-300':'border-gray-800 text-gray-400'}`}>ONLINE ALLOWED</button></div><p className="text-gray-400">API keys are not entered here. Configure OpenAI, Anthropic, Gemini, Ollama, or allowlisted CLI providers later in Settings, then run TEST CONNECTION.</p></div>}
        {step === 5 && <div className="space-y-3"><h3 className="font-bold text-cyan-300 flex gap-2"><Database size={16}/> Controlled Memory</h3><button onClick={()=>setMemoryEnabled(!memoryEnabled)} className={`w-full p-3 rounded border ${memoryEnabled?'border-cyan-500 bg-cyan-950 text-cyan-300':'border-gray-700 text-gray-400'}`}>MEMORY: {memoryEnabled?'ENABLED':'DISABLED'}</button><p className="text-gray-400">Memory setting is persisted in SQLite. No sample memories are created automatically.</p></div>}
        {step === 6 && <div className="space-y-3 text-center"><CheckCircle2 size={36} className="mx-auto text-emerald-400"/><h3 className="text-base font-bold text-white">Ready to initialize</h3><p className="text-gray-400">Settings will be written to the local database. Camera and microphone remain subject to a separate native permission prompt when actually requested.</p></div>}
      </div>
      <div className="flex justify-between border-t border-gray-800 pt-4 mt-6"><button onClick={()=>setStep(Math.max(1,step-1))} disabled={step===1} className="px-4 py-2 rounded bg-gray-800 disabled:opacity-30 text-gray-300 flex gap-1"><ArrowLeft size={14}/>Back</button><button onClick={next} className="px-5 py-2 rounded bg-cyan-500 text-black font-bold flex gap-1">{step===totalSteps?'SAVE & LAUNCH':'Continue'}<ArrowRight size={14}/></button></div>
    </div>
  </div>;
};
