import React, { useEffect, useState } from 'react';
import { ProjectManager } from '../../project/ProjectManager';
import { MioProject } from '../../types/project';
import { eventBus } from '../../core/EventBus';
import { FolderGit2, Activity, Cpu } from 'lucide-react';

interface ActivityLogItem { timestamp: number; message: string; mode: string; }

export const ContextPanel: React.FC = () => {
  const [project, setProject] = useState<MioProject>(ProjectManager.getProject());
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [runtime, setRuntime] = useState<any>(null);
  const [system, setSystem] = useState<any>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);

  const refreshTelemetry = async () => {
    if (!window.mioDesktop) return;
    try {
      const [r, s, w] = await Promise.all([window.mioDesktop.getSecurityStatus(), window.mioDesktop.getSystemInfo(), window.mioDesktop.getWorkspace()]);
      setRuntime(r); setSystem(s); setWorkspace(w);
    } catch { setRuntime(null); }
  };

  useEffect(() => {
    const unsubProj = eventBus.on('PROJECT_UPDATED', (p: MioProject) => setProject({ ...p }));
    const unsubLog = eventBus.on('ACTIVITY_LOG', (log: ActivityLogItem) => setLogs((prev) => [log, ...prev].slice(0, 30)));
    void refreshTelemetry();
    const timer = setInterval(refreshTelemetry, 10_000);
    return () => { unsubProj(); unsubLog(); clearInterval(timer); };
  }, []);

  const secureRenderer = runtime?.sandbox === true && runtime?.contextIsolation === true && runtime?.nodeIntegration === false && runtime?.webSecurity === true;

  return <aside className="w-72 bg-[#090d16] border-l border-gray-800 flex flex-col font-mono text-xs select-none">
    <div className="p-3 text-[10px] text-gray-500 font-bold tracking-wider border-b border-gray-800/80">CONTEXT // MEASURED TELEMETRY</div>
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800"><div className="flex items-center gap-2 mb-1.5 text-cyan-400"><FolderGit2 size={14}/><span className="font-bold truncate text-[11px] text-white">{project.name}</span></div><div className="space-y-1 text-[10px] text-gray-400"><div className="flex justify-between"><span>Assets:</span><span className="text-cyan-300">{project.assets.length}</span></div><div className="flex justify-between"><span>Snapshots:</span><span>{project.versions.length}</span></div><div className="mt-2 break-all"><span className="text-gray-500">Workspace:</span> {workspace || 'not authorized'}</div></div></div>
      <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 flex-1"><div className="flex items-center gap-2 mb-2 text-gray-300 font-bold text-[10px]"><Activity size={12} className="text-cyan-400"/>SESSION ACTIVITY</div><div className="space-y-2 overflow-y-auto max-h-56 pr-1 text-[10px]">{logs.length===0?<div className="text-gray-600">No activity recorded in this session.</div>:logs.map((log,i)=><div key={`${log.timestamp}-${i}`} className="border-l-2 border-cyan-500/50 pl-2 py-0.5"><span className="text-gray-500 block text-[9px]">{new Date(log.timestamp).toLocaleTimeString()} // [{log.mode}]</span><span className="text-gray-300">{log.message}</span></div>)}</div></div>
      <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 space-y-2"><div className="flex items-center gap-2 text-gray-300 font-bold text-[10px]"><Cpu size={12} className="text-cyan-400"/>RUNTIME HEALTH</div><div className="space-y-1 text-[10px] text-gray-400"><div className="flex justify-between"><span>Renderer controls:</span><span className={secureRenderer?'text-emerald-400':'text-red-400'}>{secureRenderer?'ACTIVE':'NOT VERIFIED'}</span></div><div className="flex justify-between"><span>Memory free:</span><span>{typeof system?.freeMemMb==='number'?`${system.freeMemMb} MB`:'—'}</span></div><div className="flex justify-between"><span>CPU cores:</span><span>{system?.cpuCores ?? '—'}</span></div><div className="flex justify-between"><span>File scope:</span><span className={workspace?'text-emerald-400':'text-amber-400'}>{workspace?'AUTHORIZED WORKSPACE':'BLOCKED'}</span></div></div></div>
    </div>
  </aside>;
};
