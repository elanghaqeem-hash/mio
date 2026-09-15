import React, { useState, useEffect } from 'react';
import { ProjectManager } from '../../project/ProjectManager';
import { MioProject } from '../../types/project';
import { eventBus } from '../../core/EventBus';
import { FolderGit2, Activity, Cpu } from 'lucide-react';

interface ActivityLogItem {
  timestamp: number;
  message: string;
  mode: string;
}

interface ContextPanelProps {
  mobile?: boolean;
}

const projectActivity = (project: MioProject): ActivityLogItem[] =>
  project.activityLog.slice(0, 30).map((item) => ({
    timestamp: item.timestamp,
    message: item.message,
    mode: item.mode,
  }));

export const ContextPanel: React.FC<ContextPanelProps> = ({ mobile = false }) => {
  const [project, setProject] = useState<MioProject>(ProjectManager.getProject());
  const [logs, setLogs] = useState<ActivityLogItem[]>(() => projectActivity(ProjectManager.getProject()));

  useEffect(() => {
    const unsubProj = eventBus.on('PROJECT_UPDATED', (p: MioProject) => setProject({ ...p }));
    const unsubLog = eventBus.on('ACTIVITY_LOG', (log: ActivityLogItem) => {
      setLogs((prev) => [log, ...prev].slice(0, 30));
    });

    return () => {
      unsubProj();
      unsubLog();
    };
  }, []);

  return (
    <aside
      className={`${mobile ? 'w-[min(21rem,92vw)]' : 'w-72'} h-full bg-[#090d16] border-l border-gray-800 flex flex-col font-mono text-xs select-none`}
      aria-label="MIO context and telemetry"
    >
      <div className="p-3 text-[10px] text-gray-500 font-bold tracking-wider border-b border-gray-800/80">
        CONTEXT // TELEMETRY
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-4 overscroll-contain">
        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800">
          <div className="flex items-center gap-2 mb-1.5 text-cyan-400">
            <FolderGit2 size={14} />
            <span className="font-bold truncate text-[11px] text-white">{project.name}</span>
          </div>
          <div className="space-y-1.5 text-[10px] text-gray-400">
            <div className="flex justify-between gap-3">
              <span>Assets:</span>
              <span className="text-cyan-300 font-bold">{project.assets.length} items</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Snapshots:</span>
              <span className="text-gray-300">{project.versions.length} versions</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Isolation:</span>
              <span className="text-emerald-400 text-right">PROJECT/ SANDBOX</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-gray-300 font-bold text-[10px]">
            <Activity size={12} className="text-cyan-400" />
            <span>ACTIVITY AUDIT MONITOR</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-56 pr-1 text-[10px]">
            {logs.length === 0 && <div className="text-gray-500">No runtime activity events recorded in this session.</div>}
            {logs.map((log, i) => (
              <div key={i} className="border-l-2 border-cyan-500/50 pl-2 py-0.5">
                <span className="text-gray-500 block text-[9px]">
                  {new Date(log.timestamp).toLocaleTimeString()} // [{log.mode}]
                </span>
                <span className="text-gray-300 break-words">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 space-y-2">
          <div className="flex items-center gap-2 text-gray-300 font-bold text-[10px]">
            <Cpu size={12} className="text-cyan-400" />
            <span>KNOWN RUNTIME STATE</span>
          </div>

          <div className="space-y-1.5 text-[10px] text-gray-400">
            <div className="flex justify-between gap-3"><span>Project ID:</span><span className="max-w-32 truncate text-gray-300">{project.id}</span></div>
            <div className="flex justify-between gap-3"><span>Creative Pipelines:</span><span className="text-gray-300">{project.creativePipelines?.length ?? 0}</span></div>
            <p className="pt-1 text-[9px] leading-relaxed text-gray-500">No sensor, sandbox-health, or system-health status is inferred here unless emitted by a real runtime capability.</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
