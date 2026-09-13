import React, { useEffect, useState } from 'react';
import { Settings, Cpu, Wifi, Sliders, ShieldCheck, Server, RefreshCw } from 'lucide-react';
import { AutonomyLevel, NetworkState } from '../../types/core';
import { ModelRouter } from '../../agents/ModelRouter';
import { ModelProviderId, ProviderReadiness } from '../../types/models';
import { MioSystemPreferences, systemPreferences } from '../../settings/SystemPreferences';

const CLOUD_PROVIDER_CONFIG = {
  openrouter: { label: 'OpenRouter', key: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL', placeholder: 'openrouter/auto or provider/model' },
  openai: { label: 'OpenAI', key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', placeholder: 'e.g. gpt-4.1-mini' },
  gemini: { label: 'Google Gemini', key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', placeholder: 'e.g. gemini-2.5-flash' },
  claude: { label: 'Anthropic Claude', key: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL', placeholder: 'e.g. claude-sonnet-4-20250514' },
} as const;

export const SettingsView: React.FC = () => {
  const [preferences, setPreferences] = useState<MioSystemPreferences>(() => systemPreferences.getSnapshot());
  const [readiness, setReadiness] = useState<ProviderReadiness | null>(null);
  const [checkingProvider, setCheckingProvider] = useState(false);
  const { autonomyLevel: autonomy, networkState: network, modelRouter } = preferences;
  const { provider, model = '', ollamaEndpoint = 'http://127.0.0.1:11434', allowOfflineFallback, enableWebSearch } = modelRouter;
  const cloudConfig = provider === 'openrouter' || provider === 'openai' || provider === 'gemini' || provider === 'claude' ? CLOUD_PROVIDER_CONFIG[provider] : null;

  useEffect(() => {
    return systemPreferences.subscribe(setPreferences);
  }, []);

  const handleNetworkToggle = (newNet: NetworkState) => {
    setReadiness(null);
    void systemPreferences.setNetworkState(newNet);
  };

  const updateRouter = (patch: Parameters<typeof systemPreferences.setModelRouter>[0]) => {
    setReadiness(null);
    void systemPreferences.setModelRouter(patch);
  };

  const checkProvider = async () => {
    setCheckingProvider(true);
    setReadiness(await ModelRouter.checkProviderReadiness());
    setCheckingProvider(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-6">
      <div className="flex items-center justify-between bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Settings size={16} />
          <span className="font-bold text-sm">MIO V2 SYSTEM PREFERENCES &amp; RESOURCE QUOTAS</span>
        </div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2">
          <Sliders size={14} className="text-cyan-400" /> AUTONOMY LEVEL
        </span>
        <p className="text-gray-400 text-[11px]">Controls how independently Mio generates ideas, advances project steps, or awaits explicit commands.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['PASSIVE', 'ASSISTIVE', 'PROACTIVE', 'AUTONOMOUS'] as AutonomyLevel[]).map((lvl) => (
            <button
              key={lvl}
              onClick={() => void systemPreferences.setAutonomyLevel(lvl)}
              className={`p-3 rounded-lg border cursor-pointer transition text-center ${autonomy === lvl ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/20' : 'bg-[#111726] border-gray-800 text-gray-400 hover:border-gray-700'}`}
            >
              <div className="font-bold text-xs">{lvl}</div>
              <div className="text-[10px] text-gray-500 mt-1">
                {lvl === 'PASSIVE' && 'Awaits explicit commands only'}
                {lvl === 'ASSISTIVE' && 'Default: Suggests & confirms'}
                {lvl === 'PROACTIVE' && 'Recommends bounded next steps'}
                {lvl === 'AUTONOMOUS' && 'Executes only inside explicit bounds'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
        <span className="text-gray-300 font-bold flex items-center gap-2">
          <Wifi size={14} className="text-cyan-400" /> MODEL ROUTER &amp; CONNECTIVITY
        </span>

        <div className="flex items-center gap-4">
          <button onClick={() => handleNetworkToggle('OFFLINE')} className={`flex-1 p-2.5 rounded-lg border font-bold cursor-pointer transition ${network === 'OFFLINE' ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-500'}`}>
            OFFLINE MODE
          </button>
          <button onClick={() => handleNetworkToggle('ONLINE')} className={`flex-1 p-2.5 rounded-lg border font-bold cursor-pointer transition ${network === 'ONLINE' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-[#111726] border-gray-800 text-gray-500'}`}>
            ONLINE MODE
          </button>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-800">
          <span className="text-gray-400 text-[10px] block">AI INFERENCE PROVIDER</span>
          <select value={provider} onChange={(e) => updateRouter({ provider: e.target.value as ModelProviderId, model: undefined })} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2.5 py-1.5 text-white text-xs">
            <option value="local_heuristic">MIO Local Heuristic — offline fallback / orchestration intelligence</option>
            <option value="openrouter">OpenRouter — multi-provider AI gateway</option>
            <option value="openai">OpenAI — server-side MIO Secure Proxy</option>
            <option value="gemini">Google Gemini — server-side MIO Secure Proxy</option>
            <option value="claude">Anthropic Claude — server-side MIO Secure Proxy</option>
            <option value="ollama">Ollama — local endpoint</option>
          </select>
        </div>

        {cloudConfig && (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 space-y-2">
            <div className="flex items-center gap-2 text-emerald-300 font-bold"><ShieldCheck size={14} /> SERVER-SIDE SECRET BOUNDARY</div>
            <p className="text-gray-400 text-[10px] leading-relaxed">No API key is accepted or stored by this browser. Configure <code className="text-cyan-300">{cloudConfig.key}</code> and optionally <code className="text-cyan-300">{cloudConfig.model}</code> in the Web Lab server / Cloudflare environment. Remote inference still requires the MIO L4 permission gate.</p>
          </div>
        )}

        {(cloudConfig || provider === 'ollama') && (
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] block">MODEL {cloudConfig ? `(optional when ${cloudConfig.model} is configured server-side)` : ''}</span>
            <input type="text" value={model} onChange={(e) => updateRouter({ model: e.target.value.trim() || undefined })} placeholder={cloudConfig?.placeholder ?? 'e.g. llama3.2'} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2.5 py-1.5 text-white text-xs" />
          </div>
        )}

        {provider === 'ollama' && (
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] flex items-center gap-1"><Server size={11} /> LOCAL OLLAMA ENDPOINT</span>
            <input type="text" value={ollamaEndpoint} onChange={(e) => updateRouter({ ollamaEndpoint: e.target.value })} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2.5 py-1.5 text-white text-xs" />
          </div>
        )}

        {cloudConfig && (
          <label className="flex items-center gap-3 p-3 bg-[#111726] rounded-lg border border-gray-800 cursor-pointer">
            <input type="checkbox" checked={enableWebSearch} onChange={(e) => updateRouter({ enableWebSearch: e.target.checked })} className="accent-cyan-400" />
            <span className="text-gray-300">Enable {cloudConfig.label} live web search / grounding (internet access remains L4 permission-gated)</span>
          </label>
        )}

        <label className="flex items-center gap-3 p-3 bg-[#111726] rounded-lg border border-gray-800 cursor-pointer">
          <input type="checkbox" checked={allowOfflineFallback} onChange={(e) => updateRouter({ allowOfflineFallback: e.target.checked })} className="accent-cyan-400" />
          <span className="text-gray-300">Allow clearly labelled fallback to local heuristic when selected provider is unavailable</span>
        </label>

        <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div><div className="font-bold text-gray-200">PROVIDER READINESS</div><div className="mt-1 text-[10px] text-gray-500">Checks the selected endpoint/configuration without sending chat content.</div></div>
            <button onClick={() => void checkProvider()} disabled={checkingProvider} className="flex items-center gap-1.5 rounded border border-cyan-500/40 px-3 py-1.5 font-bold text-cyan-300 disabled:opacity-50">
              <RefreshCw size={12} className={checkingProvider ? 'animate-spin' : ''} /> {checkingProvider ? 'CHECKING' : 'CHECK CONNECTION'}
            </button>
          </div>
          {readiness && <div className={`rounded border px-3 py-2 text-[10px] ${readiness.ready && readiness.status === 'READY' ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300' : readiness.status === 'LOCAL_ONLY' ? 'border-amber-500/40 bg-amber-950/20 text-amber-300' : 'border-red-500/40 bg-red-950/20 text-red-300'}`}><strong>{readiness.status}</strong> — {readiness.detail}</div>}
        </div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Cpu size={14} className="text-cyan-400" /> RESOURCE LIMITS &amp; QUOTA GUARDS</span>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-gray-400">
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-[10px] block text-gray-500">MODEL EXECUTION TIMEOUT</span><span className="text-cyan-300 font-bold">30 Seconds</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-[10px] block text-gray-500">TOOL DEFAULT TIMEOUT</span><span className="text-cyan-300 font-bold">15 Seconds</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-[10px] block text-gray-500">BROWSER SECRET STORAGE</span><span className="text-emerald-300 font-bold">DISABLED</span></div>
        </div>
      </div>
    </div>
  );
};
