import React, { useEffect, useMemo, useState } from 'react';
import { Settings, Cpu, Wifi, Sliders, Database, KeyRound, PlugZap, Trash2, RefreshCw } from 'lucide-react';
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
  const [selected, setSelected] = useState<string>('openai');
  const selectedMeta = useMemo(() => providerChoices.find((p) => p.id === selected) || providerChoices[0], [selected]);
  const [model, setModel] = useState<string>(selectedMeta.model);
  const [apiKey, setApiKey] = useState<string>('');
  const [endpoint, setEndpoint] = useState<string>((selectedMeta as any).endpoint || '');
  const [executable, setExecutable] = useState<string>((selectedMeta as any).executable || '');
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState<string>('');

  const refresh = async () => {
    if (!window.mioDesktop) return;
    const [rows, db, savedAutonomy, savedNetwork] = await Promise.all([
      window.mioDesktop.listProviders(),
      window.mioDesktop.getDatabaseStatus(),
      window.mioDesktop.getSetting('system.autonomy', 'ASSISTIVE'),
      window.mioDesktop.getSetting('system.network', 'OFFLINE'),
    ]);
    setProviders(rows as ProviderRow[]);
    setDbStatus(db);
    setAutonomy(savedAutonomy as AutonomyLevel);
    setNetwork(savedNetwork as NetworkState);
    ModelRouter.setNetworkState(savedNetwork as NetworkState);
  };

  useEffect(() => { refresh().catch((err) => setMessage(String(err))); }, []);
  useEffect(() => {
    const meta = providerChoices.find((p) => p.id === selected) || providerChoices[0];
    const existing = providers.find((p) => p.provider === selected);
    setModel(existing?.model || meta.model);
    setEndpoint(existing?.endpoint || (meta as any).endpoint || '');
    setExecutable(existing?.executable || (meta as any).executable || '');
    setApiKey('');
  }, [selected, providers]);

  const saveAutonomy = async (level: AutonomyLevel) => {
    setAutonomy(level);
    await window.mioDesktop?.setSetting('system.autonomy', level);
  };
  const saveNetwork = async (state: NetworkState) => {
    setNetwork(state); ModelRouter.setNetworkState(state);
    await window.mioDesktop?.setSetting('system.network', state);
  };

  const saveProvider = async () => {
    if (!window.mioDesktop) return;
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
    setBusy(`remove:${provider}`);
    try { await window.mioDesktop.removeProvider(provider); await refresh(); setMessage(`${provider} configuration removed.`); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-5">
      <div className="flex items-center justify-between bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300"><Settings size={16}/><span className="font-bold text-sm">MIO SYSTEM SETTINGS // CONNECTION & PERSISTENCE CONTROL</span></div>
        <button onClick={() => refresh()} className="p-2 text-gray-400 hover:text-cyan-300"><RefreshCw size={14}/></button>
      </div>

      {message && <div className="bg-[#111726] border border-cyan-500/30 rounded-lg p-3 text-gray-300 break-words">{message}</div>}

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Database size={14} className="text-cyan-400"/> LOCAL DATABASE</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">STATUS</span><span className={dbStatus?.connected ? 'text-emerald-400' : 'text-red-400'}>{dbStatus?.connected ? 'CONNECTED' : 'UNAVAILABLE'}</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">ENGINE</span><span className="text-gray-200">SQLite {dbStatus?.sqliteVersion || '—'}</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">SCHEMA</span><span className="text-gray-200">v{dbStatus?.schemaVersion || '—'}</span></div>
          <div className="bg-[#111726] p-2.5 rounded border border-gray-800"><span className="text-gray-500 block text-[10px]">JOURNAL</span><span className="text-gray-200 uppercase">{dbStatus?.journalMode || '—'}</span></div>
        </div>
        <p className="text-[10px] text-gray-500 break-all">Database location: {dbStatus?.path || 'desktop runtime required'}</p>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
        <span className="text-gray-300 font-bold flex items-center gap-2"><Sliders size={14} className="text-cyan-400"/> AUTONOMY & NETWORK</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{(['PASSIVE','ASSISTIVE','PROACTIVE','AUTONOMOUS'] as AutonomyLevel[]).map((lvl) => <button key={lvl} onClick={() => saveAutonomy(lvl)} className={`p-2 rounded border ${autonomy === lvl ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400'}`}>{lvl}</button>)}</div>
        <div className="grid grid-cols-2 gap-2"><button onClick={() => saveNetwork('OFFLINE')} className={`p-2 rounded border ${network === 'OFFLINE' ? 'border-cyan-500 text-cyan-300 bg-cyan-950' : 'border-gray-800 text-gray-400'}`}>OFFLINE</button><button onClick={() => saveNetwork('ONLINE')} className={`p-2 rounded border ${network === 'ONLINE' ? 'border-emerald-500 text-emerald-300 bg-emerald-950' : 'border-gray-800 text-gray-400'}`}>ONLINE</button></div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-4">
        <span className="text-gray-300 font-bold flex items-center gap-2"><PlugZap size={14} className="text-cyan-400"/> AI API / CLI CONNECTION MANAGER</span>
        <p className="text-[10px] text-gray-500">Cloud calls are executed only in Electron main process. Custom remote cloud endpoints are blocked. Ollama is restricted to loopback. CLI execution is allowlisted and runs without a shell.</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-gray-500">PROVIDER</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white">{providerChoices.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
            <label className="text-gray-500">MODEL</label><input value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/>
            {selected === 'ollama' && <><label className="text-gray-500">LOCAL ENDPOINT</label><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/></>}
            {selectedMeta.mode === 'cli' && <><label className="text-gray-500">ALLOWLISTED EXECUTABLE</label><input value={executable} onChange={(e) => setExecutable(e.target.value)} className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/></>}
            {selectedMeta.mode === 'api' && selected !== 'ollama' && <><label className="text-gray-500 flex items-center gap-1"><KeyRound size={11}/> API KEY {providers.find((p) => p.provider === selected)?.hasSecret ? '(encrypted key already stored; leave blank to keep it)' : ''}</label><input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key is encrypted using OS safeStorage" className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-2 text-white"/></>}
            <div className="flex gap-2"><button disabled={!!busy} onClick={saveProvider} className="flex-1 p-2 rounded bg-cyan-500 text-black font-bold disabled:opacity-50">SAVE</button><button disabled={!!busy} onClick={() => testProvider()} className="flex-1 p-2 rounded bg-emerald-700 text-white font-bold disabled:opacity-50">TEST CONNECTION</button></div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">{providers.length === 0 ? <div className="text-gray-500 p-4 border border-dashed border-gray-800 rounded">No AI provider configured.</div> : providers.map((p) => <div key={p.provider} className="bg-[#111726] border border-gray-800 p-3 rounded-lg">
            <div className="flex justify-between items-start gap-2"><div><div className="text-white font-bold">{p.provider}</div><div className="text-gray-500 text-[10px]">{p.mode.toUpperCase()} // {p.model}</div></div><span className={`text-[9px] px-2 py-0.5 rounded border ${p.lastStatus === 'connected' ? 'text-emerald-400 border-emerald-500/30' : p.lastStatus === 'error' ? 'text-red-400 border-red-500/30' : 'text-amber-400 border-amber-500/30'}`}>{(p.lastStatus || 'untested').toUpperCase()}</span></div>
            {p.lastError && <div className="text-red-300 text-[10px] mt-2 break-words">{p.lastError}</div>}
            <div className="flex gap-2 mt-2"><button onClick={() => testProvider(p.provider)} disabled={!!busy} className="px-2 py-1 bg-gray-800 rounded text-cyan-300">TEST</button><button onClick={() => removeProvider(p.provider)} disabled={!!busy} className="px-2 py-1 bg-gray-800 rounded text-red-400 flex items-center gap-1"><Trash2 size={10}/> REMOVE</button></div>
          </div>)}</div>
        </div>
      </div>

      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-2"><span className="text-gray-300 font-bold flex items-center gap-2"><Cpu size={14} className="text-cyan-400"/> SECURITY RESOURCE GUARDS</span><p className="text-gray-500 text-[10px]">Provider timeout 45s • prompt limit 120k chars • response cap 2MB • file text limit 10MB • project persistence limit 25MB.</p></div>
    </div>
  );
};
