import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Database, KeyRound, FolderLock, Cpu, RefreshCw } from 'lucide-react';

export const SecurityDashboardView: React.FC = () => {
  const [runtime, setRuntime] = useState<any>(null);
  const [db, setDb] = useState<any>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!window.mioDesktop) return;
    try {
      const [r,d,w,p,a] = await Promise.all([window.mioDesktop.getSecurityStatus(), window.mioDesktop.getDatabaseStatus(), window.mioDesktop.getWorkspace(), window.mioDesktop.listProviders(), window.mioDesktop.listAudit(200)]);
      setRuntime(r); setDb(d); setWorkspace(w); setProviders(p); setEvents(a); setError('');
    } catch (err:any) { setError(err?.message || String(err)); }
  };
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, []);

  const controls = [
    ['Renderer Sandbox', runtime?.sandbox === true], ['Context Isolation', runtime?.contextIsolation === true], ['Node Integration OFF', runtime?.nodeIntegration === false], ['Web Security', runtime?.webSecurity === true], ['OS Secret Encryption', runtime?.osSecretEncryption === true], ['SQLite', db?.connected === true],
  ];
  const allBaseline = controls.every(([,ok]) => ok === true);

  return <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-5">
    <div className="flex items-center justify-between bg-[#0d121d] p-3 rounded-xl border border-gray-800"><div className="flex items-center gap-2 text-cyan-300"><Shield size={16}/><span className="font-bold text-sm">SECURITY CONTROL CENTER // MEASURED RUNTIME STATE</span></div><div className="flex gap-2 items-center"><span className={`px-2 py-1 rounded border text-[10px] ${allBaseline?'text-emerald-400 border-emerald-500/30':'text-red-400 border-red-500/30'}`}>{allBaseline?'BASELINE CONTROLS ACTIVE':'CONTROL GAP DETECTED'}</span><button onClick={refresh} className="p-2 text-gray-400"><RefreshCw size={13}/></button></div></div>
    {error && <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-300 rounded">{error}</div>}

    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{controls.map(([name,ok])=><div key={String(name)} className="bg-[#0d121d] p-3 rounded-xl border border-gray-800"><span className="text-gray-500 text-[10px] block">{String(name).toUpperCase()}</span><span className={ok?'text-emerald-400 font-bold':'text-red-400 font-bold'}>{ok?'ACTIVE':'NOT VERIFIED'}</span></div>)}</div>

    <div className="grid md:grid-cols-3 gap-3">
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><span className="text-gray-300 font-bold flex gap-2"><FolderLock size={14} className="text-cyan-400"/>WORKSPACE BOUNDARY</span><p className="mt-3 text-[10px] text-gray-400 break-all">{workspace || 'No workspace authorized. Filesystem operations remain blocked.'}</p></div>
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><span className="text-gray-300 font-bold flex gap-2"><Database size={14} className="text-cyan-400"/>DATABASE</span><p className="mt-3 text-[10px] text-gray-400">SQLite {db?.sqliteVersion || '—'} // schema {db?.schemaVersion || '—'} // {db?.journalMode || '—'}</p></div>
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><span className="text-gray-300 font-bold flex gap-2"><KeyRound size={14} className="text-cyan-400"/>AI CONNECTIONS</span><p className="mt-3 text-[10px] text-gray-400">{providers.filter((p:any)=>p.lastStatus==='connected').length} verified / {providers.length} configured. Secrets are never returned to renderer.</p></div>
    </div>

    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><span className="text-gray-300 font-bold flex gap-2 mb-3"><Cpu size={14} className="text-cyan-400"/>PROVIDER SECURITY STATE</span>{providers.length===0?<div className="text-gray-500">No providers configured.</div>:<div className="grid md:grid-cols-2 gap-2">{providers.map((p:any)=><div key={p.provider} className="bg-[#111726] border border-gray-800 p-3 rounded"><div className="flex justify-between"><span className="text-white font-bold">{p.provider}</span><span className={p.lastStatus==='connected'?'text-emerald-400':p.lastStatus==='error'?'text-red-400':'text-amber-400'}>{String(p.lastStatus||'untested').toUpperCase()}</span></div><div className="text-[10px] text-gray-500 mt-1">{p.mode} // {p.model} // secret: {p.hasSecret?'encrypted stored':'none/not required'}</div></div>)}</div>}</div>

    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 flex-1"><span className="text-gray-300 font-bold flex items-center gap-2 mb-3"><ShieldAlert size={14} className="text-amber-400"/>PERSISTED SECURITY / CONNECTION AUDIT</span><div className="space-y-2 max-h-72 overflow-y-auto">{events.length===0?<div className="text-gray-500">No persisted security events yet.</div>:events.map((e:any)=><div key={e.id} className="p-2.5 bg-[#111726] rounded border border-gray-800"><div className="flex gap-2 items-center"><span className={`text-[9px] px-2 py-0.5 rounded ${e.blocked?'text-red-400 bg-red-950/30':'text-cyan-300 bg-cyan-950/30'}`}>{e.action}</span><span className="text-gray-500 text-[10px]">{new Date(e.timestamp).toLocaleString()}</span></div><p className="text-gray-300 mt-1 break-words">{e.details}</p></div>)}</div></div>
  </div>;
};
