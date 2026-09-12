import React, { useState } from 'react';
import { Settings, Cpu, HardDrive, Wifi, Sliders, ShieldCheck } from 'lucide-react';
import { AutonomyLevel, NetworkState } from '../../types/core';
import { ModelRouter } from '../../agents/ModelRouter';

export const SettingsView: React.FC = () => {
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('ASSISTIVE');
  const [network, setNetwork] = useState<NetworkState>(ModelRouter.getNetworkState());
  const [apiKey, setApiKey] = useState<string>('');
  const [provider, setProvider] = useState<string>('local_heuristic');

  const handleNetworkToggle = (newNet: NetworkState) => {
    setNetwork(newNet);
    ModelRouter.setNetworkState(newNet);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Settings size={16} />
          <span className="font-bold text-sm">MIO V2 SYSTEM PREFERENCES &amp; RESOURCE QUOTAS</span>
        </div>
      </div>

      {/* Autonomy Level */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold block flex items-center gap-2">
          <Sliders size={14} className="text-cyan-400" /> AUTONOMY LEVEL
        </span>
        <p className="text-gray-400 text-[11px]">
          Controls how independently Mio generates ideas, advances project steps, or awaits explicit commands.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['PASSIVE', 'ASSISTIVE', 'PROACTIVE', 'AUTONOMOUS'] as AutonomyLevel[]).map((lvl) => (
            <div
              key={lvl}
              onClick={() => setAutonomy(lvl)}
              className={`p-3 rounded-lg border cursor-pointer transition text-center ${
                autonomy === lvl
                  ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/20'
                  : 'bg-[#111726] border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="font-bold text-xs">{lvl}</div>
              <div className="text-[10px] text-gray-500 mt-1">
                {lvl === 'PASSIVE' && 'Awaits explicit commands only'}
                {lvl === 'ASSISTIVE' && 'Default: Suggests & confirms'}
                {lvl === 'PROACTIVE' && 'Recommends creative next steps'}
                {lvl === 'AUTONOMOUS' && 'Executes within bounds'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Connectivity & Model Abstraction */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
        <span className="text-gray-300 font-bold block flex items-center gap-2">
          <Wifi size={14} className="text-cyan-400" /> MODEL ROUTER &amp; CONNECTIVITY
        </span>

        <div className="flex items-center gap-4">
          <button
            onClick={() => handleNetworkToggle('OFFLINE')}
            className={`flex-1 p-2.5 rounded-lg border font-bold cursor-pointer transition ${
              network === 'OFFLINE'
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'bg-[#111726] border-gray-800 text-gray-500'
            }`}
          >
            OFFLINE MODE (Local Procedural Engines)
          </button>
          <button
            onClick={() => handleNetworkToggle('ONLINE')}
            className={`flex-1 p-2.5 rounded-lg border font-bold cursor-pointer transition ${
              network === 'ONLINE'
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-[#111726] border-gray-800 text-gray-500'
            }`}
          >
            ONLINE MODE (Authorized Web &amp; APIs)
          </button>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-800">
          <span className="text-gray-400 text-[10px] block">AI INFERENCE PROVIDER</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-[#141b2b] border border-gray-700 rounded px-2.5 py-1.5 text-white text-xs"
          >
            <option value="local_heuristic">Built-in Local Procedural Synthesis (Offline / Zero-latency)</option>
            <option value="gemini">Google Gemini API</option>
            <option value="claude">Anthropic Claude API</option>
            <option value="ollama">Local Ollama / WebLLM Endpoint</option>
          </select>
        </div>

        {provider !== 'local_heuristic' && (
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] block">API KEY / ACCESS TOKEN</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter secure API token (stored in memory sandbox)..."
              className="w-full bg-[#141b2b] border border-gray-700 rounded px-2.5 py-1.5 text-white text-xs"
            />
          </div>
        )}
      </div>

      {/* Resource Limits */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold block flex items-center gap-2">
          <Cpu size={14} className="text-cyan-400" /> RESOURCE LIMITS &amp; QUOTA GUARDS
        </span>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-gray-400">
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800">
            <span className="text-[10px] block text-gray-500">MAX EXECUTION TIMEOUT</span>
            <span className="text-cyan-300 font-bold">15.00 Seconds</span>
          </div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800">
            <span className="text-[10px] block text-gray-500">MAX GENERATION STEPS</span>
            <span className="text-cyan-300 font-bold">100 Iterations</span>
          </div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800">
            <span className="text-[10px] block text-gray-500">MAX MEMORY ALLOCATION</span>
            <span className="text-cyan-300 font-bold">256 MB Sandbox</span>
          </div>
        </div>
      </div>
    </div>
  );
};
