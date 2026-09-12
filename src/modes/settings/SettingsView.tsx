import React, { useEffect, useMemo, useState } from 'react';
import { Settings, Cpu, Sliders, Database, KeyRound, PlugZap, Trash2, RefreshCw, Globe2, Cloud, Save } from 'lucide-react';
import { AutonomyLevel, NetworkState } from '../../types/core';
import { ModelRouter } from '../../agents/ModelRouter';

interface ProviderRow {
  provider: string;
  mode: 'api' | 'cli';
  model: string;
  endpoint?: string | null;
  executable?: string | null;
  enabled: boolean;
  hasSecret: boolean;
  lastTestAt?: number | null;
  lastStatus?: 'untested' | 'connected' | 'error' | null;
  lastError?: string | null;
  secretStorage?: string;
}

const providerChoices = [
  { id: 'openai', label: 'OpenAI API', mode: 'api', model: 'gpt-5.6' },
  { id: 'anthropic', label: 'Anthropic Claude API', mode: 'api', model: 'claude-sonnet-4-5' },
  { id: 'gemini', label: 'Google Gemini API', mode: 'api', model: 'gemini-2.5-flash' },
  { id: 'ollama', label: 'Ollama Local API', mode: 'api', model: 'llama3.2', endpoint: 'http://127.0.0.1:11434' },
  { id: 'claude_cli', label: 'Claude Code CLI', mode: 'cli', model: 'default', executable: 'claude' },
  { id: 'gemini_cli', label: 'Gemini CLI', mode: 'cli', model: 'default', executable: 'gemini' },
  { id: 'ollama_cli', label: 'Ollama CLI', mode: 'cli', model: 'llama3.2', executable: 'ollama' },
] as const;

export const SettingsView: React.FC = () => {
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('ASSISTIVE');
  const [network, setNetwork] = useState<NetworkState>(ModelRouter.getNetworkState());
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [runtime, setRuntime] = useState<'desktop' | 'web'>('desktop');
  const [research, setResearch] = useState<{ provider: string; live: boolean; fullWeb: boolean } | null>(null);
  const [researchEndpoint, setResearchEndpoint] = useState('');
  const [selected, setSelected] = useState<string>('openai');
  const availableChoices = useMemo(() => runtime === 'web' ? providerChoices.filter((item) => ['openai','anthropic','gemini'].includes(item.id)) : providerChoices, [runtime]);
  const selectedMeta = useMemo(() => availableChoices.find((p) => p.id === selected) || availableChoices[0], [selected, availableChoices]);
  const [model, setModel] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [endpoint, setEndpoint] = useState<string>('');
  const [executable, setExecutable] = useState<string>('');
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState<string>('');

  const refresh = async () => {
    if (!window.mioDesktop) return;
    const [rows, db, security, savedAutonomy, savedNetwork, savedResearchEndpoint] = await Promise.all([
      window.mioDesktop.listProviders(),
      window.mioDesktop.getDatabaseStatus(),
      window.mioDesktop.getSecurityStatus(),
      window.mioDesktop.getSetting('system.autonomy', 'ASSISTIVE'),
      window.mioDesktop.getSetting('system.network', 'OFFLINE'),
      window.mioDesktop.getSetting('research.webEndpoint', ''),
    ]);
    const kind = security?.runtime === 'web' ? 'web' : 'desktop';
    setRuntime(kind);
    setProviders(rows as ProviderRow[]);
    setDbStatus(db);
    setAutonomy(savedAutonomy as AutonomyLevel);
    setNetwork(savedNetwork as NetworkState);
    setResearchEndpoint(typeof savedResearchEndpoint === 'string' ? savedResearchEndpoint : '');
    ModelRouter.setNetworkState(savedNetwork as NetworkState);
    if (kind === 'web') {
      try {
        const response = await fetch('/api/capabilities', { cache: 'no-store', credentials: 'same-origin' });
        const data = await response.json();
        setResearch(data?.research || null);
      } catch { setResearch(null); }
    } else {
      setResearch({ provider: savedResearchEndpoint ? 'cloudflare-pages' : 'not-configured', live: Boolean(savedResearchEndpoint), fullWeb: false });
    }
  };

  useEffect(() => { void refresh().catch((err) => setMessage(String(err))); }, []);
  useEffect(() => {
    const meta = availableChoices.find((p) => p.id === selected) || availableChoices[0];
    if (!meta) return;
    const existing = providers.find((p) => p.provider === selected);
    setModel(existing?.model || meta.model);
    setEndpoint(existing?.endpoint || ('endpoint' in meta ? meta.endpoint : '') || '');
    setExecutable(existing?.executable || ('executable' in meta ? meta.executable : '') || '');
    setApiKey('');
  }, [selected, providers, availableChoices]);
  useEffect(() => { if (!availableChoices.some((item) => item.id === selected) && availableChoices[0]) setSelected(availableChoices[0].id); }, [runtime, availableChoices, selected]);

  const saveAutonomy = async (level: AutonomyLevel) => { setAutonomy(level); await window.mioDesktop?.setSetting('system.autonomy', level); };
  const saveNetwork = async (state: NetworkState) => { setNetwork(state); ModelRouter.setNetworkState(state); await window.mioDesktop?.setSetting('system.network', state); };

  const saveResearchEndpoint = async () => {
    const value = researchEndpoint.trim().replace(/\/$/, '');
    if (runtime === 'desktop' && value && !/^https:\/\//i.test(value)) { setMessage('Research endpoint must use HTTPS.'); return; }
    await window.mioDesktop?.setSetting('research.webEndpoint', value);
    setResearchEndpoint(value);
    setResearch({ provider: value ? 'cloudflare-pages' : 'not-configured', live: Boolean(value), fullWeb: false });
    setMessage(value ? 'Desktop Research endpoint saved. MIO will use this Cloudflare backend in ONLINE mode.' : 'Desktop Research endpoint cleared.');
  };

  const saveProvider = async () => {
    if (!window.mioDesktop || !selectedMeta) return;
    if (runtime === 'web') { setMessage('Web API keys are intentionally not accepted by the browser. Configure encrypted Cloudflare secrets and model variables, then refresh this page.'); return; }
    setBusy('save'); setMessage('');
    try {
      await window.mioDesktop.saveProvider({ provider: selected, mode: selectedMeta.mode, model, endpoint: endpoint || undefined, executable: executable || undefined, apiKey: apiKey || undefined, enabled: true });
      setApiKey(''); await refresh(); setMessage('Connection configuration saved securely. API keys are encrypted by the operating system and are never returned to the renderer.');
    } catch (err: any) { setMessage(`Save failed: ${err?.message || String(err)}`); }
    finally { setBusy(''); }
  };

  const testProvider = async (provider = selected) => {
    if (!window.mioDesktop) return;
    setBusy(`test:${provider}`); setMessage('');
    try {
      const result = await window.mioDesktop.testProvider(provider);
      await refresh(); setMessage(result.success ? `${provider}: connection verified (${result.latencyMs} ms).` : `${provider}: connection failed — ${result.error}`);
    } catch (err: any) { setMessage(`Test failed: ${err?.message || String(err)}`); }
    finally { setBusy(''); }
  };

  const removeProvider = async (provider: string) => {
    if (!window.mioDesktop) return;
    if (runtime === 'web') { setMessage('Cloud provider removal must be done by deleting the corresponding Cloudflare secret/model variable.'); return; }
    setBusy(`remove:${provider}`);
    try { await window.mioDesktop.removeProvider(provider); await refresh(); setMessage(`${provider} configuration removed.`); }
    finally { setBusy(''); }
  };

  const dbEngine = dbStatus?.engine || (runtime === 'web' ? 'IndexedDB' : `SQLite ${dbStatus?.sqliteVersion || ''}`);

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-5">
      <div className="flex items-center justify-between bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300"><Settings size={16}/><span className="font-bold text-sm">MIO SETTINGS // {runtime === 'web' ? 'WEB + CLOUDFLARE' : 'DESKTOP'} CONNECTION CONTROL</span></div>
        <button onClick={() => void refresh()} className="p-2 text-gray-400 hover:text-cyan-300"><RefreshCw size={14}/></button>
      </div>

      {message && <div className="bg-[#111726] border border-cyan-500/30 rounded-lg p-3 text-gray-300 break-words">{message}</div>}

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Database size={14} className="text-cyan-400"/> {runtime === 'web' ? 'BROWSER PERSISTENCE' : 'LOCAL DATABASE'}</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">STATUS</span><span className={dbStatus?.connected ? 'text-emerald-400' : 'text-red-400'}>{dbStatus?.connected ? 'CONNECTED' : 'UNAVAILABLE'}</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">ENGINE</span><span className="text-gray-200">{dbEngine}</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">SCHEMA</span><span className="text-gray-200">v{dbStatus?.schemaVersion || '—'}</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">LOCATION</span><span className="text-gray-200">{runtime === 'web' ? 'Browser profile' : 'App userData'}</span></div>
        </div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Sliders size={14} className="text-cyan-400"/> AUTONOMY & NETWORK</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{(['PASSIVE','ASSISTIVE','PROACTIVE','AUTONOMOUS'] as AutonomyLevel[]).map((lvl) => <button key={lvl} onClick={() => void saveAutonomy(lvl)} className={`p-2 rounded border ${autonomy === lvl ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}>{lvl}</button>)}</div>
        <div className="grid grid-cols-2 gap-2"><button onClick={() => void saveNetwork('OFFLINE')} className={`p-2 rounded border ${network === 'OFFLINE' ? 'border-cyan-500 text-cyan-300 bg-cyan-950' : 'border-gray-800 text-gray-400'}`}>OFFLINE</button><button onClick={() => void saveNetwork('ONLINE')} className={`p-2 rounded border ${network === 'ONLINE' ? 'border-emerald-500 text-emerald-300 bg-emerald-950' : 'border-gray-800 text-gray-400'}`}>ONLINE</button></div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Globe2 size={14} className="text-cyan-400"/> RESEARCH LIVE SEARCH</span>
        {runtime === 'web' ? <>
          <div className="grid grid-cols-2 gap-2"><div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">CONNECTOR</span><span className="text-emerald-300 font-bold">{research?.provider || 'checking…'}</span></div><div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">COVERAGE</span><span className="text-cyan-300">{research?.fullWeb ? 'GENERAL WEB' : 'WIKIPEDIA + CROSSREF'}</span></div></div>
          <p className="text-gray-500 text-[10px]">Research works immediately with public sources. Add Cloudflare secret <code>BRAVE_SEARCH_API_KEY</code> for general web search. Search snippets remain unverified evidence until corroborated.</p>
        </> : <>
          <label className="text-gray-500">CLOUDFLARE PAGES BASE URL (HTTPS)</label>
          <div className="flex gap-2"><input value={researchEndpoint} onChange={(e) => setResearchEndpoint(e.target.value)} placeholder="https://mio.pages.dev" className="flex-1 bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/><button onClick={() => void saveResearchEndpoint()} className="px-4 bg-cyan-500 text-black font-bold rounded flex items-center gap-1"><Save size={12}/>SAVE</button></div>
          <p className="text-gray-500 text-[10px]">Desktop MIO can reuse the same hardened Cloudflare Research Function after the web deployment URL is known.</p>
        </>}
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
        <span className="text-gray-300 font-bold flex items-center gap-2"><PlugZap size={14} className="text-cyan-400"/> AI API {runtime === 'web' ? 'CLOUD CONNECTIONS' : '/ CLI CONNECTION MANAGER'}</span>
        {runtime === 'web' ? <div className="bg-cyan-950/20 border border-cyan-500/30 rounded p-3 text-cyan-200 text-[10px] flex gap-2"><Cloud size={13} className="shrink-0"/><span>Browser code never receives AI API keys. Configure <b>OPENAI_API_KEY + OPENAI_MODEL</b>, <b>ANTHROPIC_API_KEY + ANTHROPIC_MODEL</b>, and/or <b>GEMINI_API_KEY + GEMINI_MODEL</b> as Cloudflare environment secrets/variables. CLI and localhost Ollama are desktop-only.</span></div> : <p className="text-[10px] text-gray-500">Cloud calls execute only in Electron main process. Custom remote cloud endpoints are blocked. Ollama is loopback-only. CLI execution is allowlisted and runs without a shell.</p>}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-gray-500">PROVIDER</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white">{availableChoices.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
            {runtime === 'desktop' && selectedMeta && <>
              <label className="text-gray-500">MODEL</label><input value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/>
              {selected === 'ollama' && <><label className="text-gray-500">LOCAL ENDPOINT</label><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/></>}
              {selectedMeta.mode === 'cli' && <><label className="text-gray-500">ALLOWLISTED EXECUTABLE</label><input value={executable} onChange={(e) => setExecutable(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/></>}
              {selectedMeta.mode === 'api' && selected !== 'ollama' && <><label className="text-gray-500 flex items-center gap-1"><KeyRound size={11}/> API KEY {providers.find((p) => p.provider === selected)?.hasSecret ? '(encrypted key stored; blank keeps it)' : ''}</label><input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Encrypted using OS safeStorage" className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/></>}
              <button disabled={!!busy} onClick={() => void saveProvider()} className="w-full p-2 rounded bg-cyan-500 text-black font-bold disabled:opacity-50">SAVE DESKTOP CONNECTION</button>
            </>}
            <button disabled={!!busy || !providers.some((p) => p.provider === selected)} onClick={() => void testProvider()} className="w-full p-2 rounded bg-emerald-700 text-white font-bold disabled:opacity-40">TEST CONFIGURED CONNECTION</button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">{providers.length === 0 ? <div className="text-gray-500 p-4 border border-dashed border-gray-800 rounded">{runtime === 'web' ? 'No Cloudflare AI provider configured. MIO web still runs; add server-side secrets when cloud AI is required.' : 'No AI provider configured.'}</div> : providers.map((p) => <div key={p.provider} className="bg-[#111726] border border-gray-800 p-3 rounded-lg">
            <div className="flex justify-between items-start gap-2"><div><div className="text-white font-bold">{p.provider}</div><div className="text-gray-500 text-[10px]">{p.mode.toUpperCase()} // {p.model}</div><div className="text-gray-600 text-[9px]">Secret: {p.secretStorage || (runtime === 'web' ? 'Cloudflare' : 'OS safeStorage')}</div></div><span className={`text-[9px] px-2 py-0.5 rounded border ${p.lastStatus === 'connected' ? 'text-emerald-400 border-emerald-500/30' : p.lastStatus === 'error' ? 'text-red-400 border-red-500/30' : 'text-amber-400 border-amber-500/30'}`}>{(p.lastStatus || 'untested').toUpperCase()}</span></div>
            {p.lastError && <div className="text-red-300 text-[10px] mt-2 break-words">{p.lastError}</div>}
            <div className="flex gap-2 mt-2"><button onClick={() => void testProvider(p.provider)} disabled={!!busy} className="px-2 py-1 bg-gray-800 rounded text-cyan-300">TEST</button>{runtime === 'desktop' && <button onClick={() => void removeProvider(p.provider)} disabled={!!busy} className="px-2 py-1 bg-gray-800 rounded text-red-400 flex items-center gap-1"><Trash2 size={10}/> REMOVE</button>}</div>
          </div>)}</div>
        </div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-2"><span className="text-gray-300 font-bold flex items-center gap-2"><Cpu size={14} className="text-cyan-400"/> SECURITY RESOURCE GUARDS</span><p className="text-gray-500 text-[10px]">Provider timeout 45s • prompt limit 120k chars • response cap 2MB • file text limit 10MB • no browser-side AI secrets • research upstream allowlist only.</p></div>
    </div>
  );
};
