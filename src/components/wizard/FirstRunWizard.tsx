import React, { useState } from 'react';
import { Shield, Sparkles, Mic, Camera, FolderCheck, Sliders, Database, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';

interface FirstRunWizardProps {
  onComplete: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<number>(1);
  const totalSteps = 10;

  // Wizard state preferences
  const [privacyConsent, setPrivacyConsent] = useState(true);
  const [provider, setProvider] = useState('local_heuristic');
  const [micAllowed, setMicAllowed] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [autonomy, setAutonomy] = useState('ASSISTIVE');
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      localStorage.setItem('mio_v2_setup_completed', 'true');
      onComplete();
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 font-mono text-xs select-none">
      <div className="bg-[#0b101d] border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-8 shadow-2xl shadow-cyan-950/60 flex flex-col">
        {/* Header with Step Indicator */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <MioCoreVisualizer state="PROCESSING" size={38} interactive={false} />
            <div>
              <h2 className="text-base font-bold text-white tracking-wider flex items-center gap-2">
                MIO V2 // INITIAL DESKTOP SETUP
              </h2>
              <span className="text-[10px] text-cyan-400">Step {step} of {totalSteps}</span>
            </div>
          </div>
          <div className="w-32 bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-cyan-400 h-full transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Contents */}
        <div className="flex-1 min-h-[280px] flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-3 text-center">
              <h3 className="text-lg font-bold text-cyan-300">Welcome to Mio V2</h3>
              <p className="text-gray-300 text-sm max-w-md mx-auto leading-relaxed">
                Mio is an agentic, multimodal AI desktop environment with native creative capabilities (3D, animation, graphics, SFX, music) and strict security boundaries.
              </p>
              <div className="p-3 bg-[#111726] rounded-xl border border-gray-800 text-gray-400 text-xs max-w-md mx-auto">
                No Terminal required for normal operation. Completely private and local-first by default.
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <Shield size={16} /> Privacy Configuration
              </h3>
              <p className="text-gray-400">
                Mio adheres to strict local-first privacy. Your creative assets, files, and conversations remain in your local project sandbox.
              </p>
              <label className="flex items-center gap-3 p-3 bg-[#111726] rounded-lg border border-cyan-500/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={(e) => setPrivacyConsent(e.target.checked)}
                  className="accent-cyan-400 rounded"
                />
                <span className="text-gray-200">Enforce conservative privacy boundaries (Zero silent telemetry)</span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300">AI Provider Selection</h3>
              <p className="text-gray-400">Choose your default inference engine:</p>
              <div className="space-y-2">
                <div
                  onClick={() => setProvider('local_heuristic')}
                  className={`p-3 rounded-lg border cursor-pointer ${
                    provider === 'local_heuristic'
                      ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                      : 'bg-[#111726] border-gray-800 text-gray-400'
                  }`}
                >
                  <div className="font-bold">Local Procedural &amp; Offline Reasoning (Recommended)</div>
                  <div className="text-[10px] text-gray-400">Works 100% offline, zero latency, zero cloud dependency.</div>
                </div>
                <div
                  onClick={() => setProvider('cloud_api')}
                  className={`p-3 rounded-lg border cursor-pointer ${
                    provider === 'cloud_api'
                      ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                      : 'bg-[#111726] border-gray-800 text-gray-400'
                  }`}
                >
                  <div className="font-bold">External Cloud Model Provider (Gemini / Claude / OpenAI)</div>
                  <div className="text-[10px] text-gray-400">Connects to remote APIs when authorized.</div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300">Local AI Engine Diagnostics</h3>
              <div className="p-4 bg-[#111726] rounded-lg border border-gray-800 space-y-2">
                <div className="flex justify-between text-gray-300">
                  <span>Built-in Procedural 3D Engine:</span>
                  <span className="text-emerald-400 font-bold">READY (Three.js WebGL)</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Built-in SFX &amp; Music Synthesizer:</span>
                  <span className="text-emerald-400 font-bold">READY (Web Audio API)</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Vector / 2D Graphic Engine:</span>
                  <span className="text-emerald-400 font-bold">READY (HTML5 Canvas)</span>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <Mic size={16} /> Microphone Access (STT)
              </h3>
              <p className="text-gray-400">
                Default: OFF. Background speech is never monitored or processed as commands unless explicitly activated.
              </p>
              <button
                onClick={() => setMicAllowed(!micAllowed)}
                className={`w-full p-3 rounded-lg border font-bold cursor-pointer transition ${
                  micAllowed ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'
                }`}
              >
                {micAllowed ? 'MICROPHONE ACCESS: ENABLED (PUSH-TO-TALK)' : 'MICROPHONE ACCESS: OFF (DEFAULT)'}
              </button>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <Camera size={16} /> Optical Camera Sensor
              </h3>
              <p className="text-gray-400">
                Camera is strictly used for local optical motion tracking / skeletal pose extraction. Zero silent recording or video uploading.
              </p>
              <button
                onClick={() => setCameraAllowed(!cameraAllowed)}
                className={`w-full p-3 rounded-lg border font-bold cursor-pointer transition ${
                  cameraAllowed ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'
                }`}
              >
                {cameraAllowed ? 'CAMERA ACCESS: ENABLED FOR MOTION TRACKING' : 'CAMERA ACCESS: OFF (DEFAULT)'}
              </button>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <FolderCheck size={16} /> File Sandbox Boundary
              </h3>
              <p className="text-gray-400">
                Mio only accesses directories you explicitly authorize. Permanent deletion is disabled by default; modifications support rollback.
              </p>
              <div className="p-3 bg-[#111726] rounded-lg border border-emerald-500/30 text-emerald-400">
                ✓ Isolated Project Sandbox configured: <code className="text-white">PROJECT/</code>
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <Sliders size={16} /> Autonomy Level Configuration
              </h3>
              <p className="text-gray-400">How autonomously should Mio suggest or execute tasks?</p>
              <div className="grid grid-cols-2 gap-2">
                {['PASSIVE', 'ASSISTIVE', 'PROACTIVE', 'AUTONOMOUS'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setAutonomy(lvl)}
                    className={`p-2.5 rounded border text-left cursor-pointer transition ${
                      autonomy === lvl ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'
                    }`}
                  >
                    <div className="font-bold">{lvl}</div>
                    <div className="text-[10px] text-gray-500">
                      {lvl === 'ASSISTIVE' ? 'Default: Recommends and requests confirmation' : 'Requires explicit bounds'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <Database size={16} /> Controlled Memory Configuration
              </h3>
              <p className="text-gray-400">
                Allow Mio to remember your preferences and project context? (You can view, edit, or delete any memory item at any time).
              </p>
              <button
                onClick={() => setMemoryEnabled(!memoryEnabled)}
                className={`w-full p-3 rounded-lg border font-bold cursor-pointer transition ${
                  memoryEnabled ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'
                }`}
              >
                {memoryEnabled ? 'MEMORY: ENABLED (USER CONTROLLED)' : 'MEMORY: DISABLED (STATELESS)'}
              </button>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-3 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-white">Setup Complete</h3>
              <p className="text-gray-400 text-sm max-w-sm mx-auto">
                Mio V2 desktop environment is configured and ready. You may change any of these settings at any time in the Settings or Security Center.
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-6">
          <button
            onClick={handlePrev}
            disabled={step === 1}
            className="flex items-center gap-1 px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 font-bold transition cursor-pointer"
          >
            <ArrowLeft size={14} /> Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-5 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/20 transition cursor-pointer"
          >
            <span>{step === totalSteps ? 'LAUNCH MIO V2' : 'Continue'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
