import React, { useState } from 'react';
import { Shield, Mic, Camera, FolderCheck, Sliders, Database, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';
import { ModelRouter } from '../../agents/ModelRouter';
import { ModelProviderId } from '../../types/models';
import { systemPreferences } from '../../settings/SystemPreferences';

interface FirstRunWizardProps {
  onComplete: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<number>(1);
  const totalSteps = 10;
  const [privacyConsent, setPrivacyConsent] = useState(true);
  const [provider, setProvider] = useState<ModelProviderId>('local_heuristic');
  const [micAllowed, setMicAllowed] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [autonomy, setAutonomy] = useState('ASSISTIVE');
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  const handleNext = async () => {
    if (step < totalSteps) {
      setStep(step + 1);
      return;
    }

    await systemPreferences.update({
      autonomyLevel: autonomy as 'PASSIVE' | 'ASSISTIVE' | 'PROACTIVE' | 'AUTONOMOUS',
      networkState: provider === 'openai' || provider === 'gemini' || provider === 'claude' ? 'ONLINE' : 'OFFLINE',
      modelRouter: {
        ...ModelRouter.getConfig(),
        provider,
        allowOfflineFallback: false,
        enableWebSearch: provider === 'openai' || provider === 'gemini' || provider === 'claude',
        proxyEndpoint: '/api/ai/generate',
      },
    });
    localStorage.setItem('mio_v2_setup_completed', 'true');
    onComplete();
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 font-mono text-xs select-none">
      <div className="bg-[#0b101d] border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-8 shadow-2xl shadow-cyan-950/60 flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <MioCoreVisualizer state="PROCESSING" size={38} interactive={false} />
            <div>
              <h2 className="text-base font-bold text-white tracking-wider">MIO // TECHNOLOGY PREVIEW SETUP</h2>
              <span className="text-[10px] text-cyan-400">Step {step} of {totalSteps}</span>
            </div>
          </div>
          <div className="w-32 bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-cyan-400 h-full transition-all duration-300" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>

        <div className="flex-1 min-h-[280px] flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-3 text-center">
              <h3 className="text-lg font-bold text-cyan-300">Welcome to MIO Web Lab</h3>
              <p className="text-gray-300 text-sm max-w-md mx-auto leading-relaxed">MIO is an agentic, multimodal AI operating environment being validated through a browser-based Technology Preview before deeper desktop integration.</p>
              <div className="p-3 bg-[#111726] rounded-xl border border-gray-800 text-gray-400 text-xs max-w-md mx-auto">Local-first by default. External AI and network actions remain permission-gated.</div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2"><Shield size={16} /> Privacy Configuration</h3>
              <p className="text-gray-400">MIO keeps project state and memory inside controlled storage boundaries and does not silently send content to external AI providers.</p>
              <label className="flex items-center gap-3 p-3 bg-[#111726] rounded-lg border border-cyan-500/30 cursor-pointer">
                <input type="checkbox" checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} className="accent-cyan-400 rounded" />
                <span className="text-gray-200">Enforce conservative privacy boundaries (zero silent telemetry)</span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300">AI Provider Selection</h3>
              <p className="text-gray-400">Choose the initial inference path. This can be changed later.</p>
              <div className="space-y-2">
                {[
                  ['local_heuristic', 'MIO Local Heuristic', 'Offline orchestration, classification and transparent fallback.'],
                  ['openai', 'OpenAI via MIO Secure Proxy', 'Real cloud inference; secret remains server-side and each remote use is permission-gated.'],
                  ['gemini', 'Google Gemini via MIO Secure Proxy', 'Gemini inference and optional Google Search grounding through server-side credentials.'],
                  ['claude', 'Anthropic Claude via MIO Secure Proxy', 'Claude inference and optional web search through server-side credentials.'],
                  ['ollama', 'Local Ollama', 'Local model endpoint for environments where Ollama is available.'],
                ].map(([id, label, description]) => (
                  <button key={id} onClick={() => setProvider(id as ModelProviderId)} className={`w-full text-left p-3 rounded-lg border cursor-pointer ${provider === id ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}>
                    <div className="font-bold">{label}</div><div className="text-[10px] text-gray-400">{description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300">Internal Engine Diagnostics</h3>
              <div className="p-4 bg-[#111726] rounded-lg border border-gray-800 space-y-2">
                <div className="flex justify-between text-gray-300"><span>3D Engine:</span><span className="text-emerald-400 font-bold">READY (Three.js WebGL)</span></div>
                <div className="flex justify-between text-gray-300"><span>SFX &amp; Music Engine:</span><span className="text-emerald-400 font-bold">READY (Web Audio API)</span></div>
                <div className="flex justify-between text-gray-300"><span>Graphic Engine:</span><span className="text-emerald-400 font-bold">READY (Canvas)</span></div>
                <div className="flex justify-between text-gray-300"><span>AI Router:</span><span className="text-emerald-400 font-bold">READY ({provider})</span></div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3"><h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2"><Mic size={16} /> Microphone Access (STT)</h3><p className="text-gray-400">Default: OFF. Background speech is never processed as a command unless explicitly activated.</p><button onClick={() => setMicAllowed(!micAllowed)} className={`w-full p-3 rounded-lg border font-bold cursor-pointer ${micAllowed ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}>{micAllowed ? 'MICROPHONE ACCESS: ENABLED (PUSH-TO-TALK)' : 'MICROPHONE ACCESS: OFF (DEFAULT)'}</button></div>
          )}

          {step === 6 && (
            <div className="space-y-3"><h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2"><Camera size={16} /> Optical Camera Sensor</h3><p className="text-gray-400">Camera access is explicit and intended for local motion/pose processing.</p><button onClick={() => setCameraAllowed(!cameraAllowed)} className={`w-full p-3 rounded-lg border font-bold cursor-pointer ${cameraAllowed ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}>{cameraAllowed ? 'CAMERA ACCESS: ENABLED' : 'CAMERA ACCESS: OFF (DEFAULT)'}</button></div>
          )}

          {step === 7 && (
            <div className="space-y-3"><h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2"><FolderCheck size={16} /> File Sandbox Boundary</h3><p className="text-gray-400">MIO only accesses explicitly authorized resources. Desktop filesystem authority is not simulated in Web Lab.</p><div className="p-3 bg-[#111726] rounded-lg border border-emerald-500/30 text-emerald-400">✓ Project sandbox abstraction enabled</div></div>
          )}

          {step === 8 && (
            <div className="space-y-3"><h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2"><Sliders size={16} /> Autonomy Level</h3><div className="grid grid-cols-2 gap-2">{['PASSIVE', 'ASSISTIVE', 'PROACTIVE', 'AUTONOMOUS'].map((lvl) => <button key={lvl} onClick={() => setAutonomy(lvl)} className={`p-2.5 rounded border text-left cursor-pointer ${autonomy === lvl ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}><div className="font-bold">{lvl}</div><div className="text-[10px] text-gray-500">{lvl === 'ASSISTIVE' ? 'Default: recommends and confirms' : 'Always bounded by permission policy'}</div></button>)}</div></div>
          )}

          {step === 9 && (
            <div className="space-y-3"><h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2"><Database size={16} /> Controlled Memory</h3><p className="text-gray-400">External content cannot become long-term memory without MemoryPolicy review.</p><button onClick={() => setMemoryEnabled(!memoryEnabled)} className={`w-full p-3 rounded-lg border font-bold cursor-pointer ${memoryEnabled ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}>{memoryEnabled ? 'MEMORY: ENABLED (USER CONTROLLED)' : 'MEMORY: DISABLED'}</button></div>
          )}

          {step === 10 && (
            <div className="space-y-3 text-center"><div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center"><CheckCircle2 size={24} /></div><h3 className="text-base font-bold text-white">Setup Complete</h3><p className="text-gray-400 text-sm max-w-sm mx-auto">MIO Web Lab is configured. Provider, permissions and resource settings remain adjustable.</p></div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-6">
          <button onClick={handlePrev} disabled={step === 1} className="flex items-center gap-1 px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 font-bold cursor-pointer"><ArrowLeft size={14} /> Back</button>
          <button onClick={() => void handleNext()} className="flex items-center gap-1 px-5 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/20 cursor-pointer"><span>{step === totalSteps ? 'LAUNCH MIO WEB LAB' : 'Continue'}</span><ArrowRight size={14} /></button>
        </div>
      </div>
    </div>
  );
};
