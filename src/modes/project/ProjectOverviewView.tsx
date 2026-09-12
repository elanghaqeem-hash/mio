import React, { useState, useEffect } from 'react';
import { ProjectManager } from '../../project/ProjectManager';
import { VersionManager } from '../../project/VersionManager';
import { CreativeOrchestrator, CreativePlanStep } from '../../agents/CreativeOrchestrator';
import { MioProject, ProjectAsset } from '../../types/project';
import { FolderGit2, Play, RotateCcw, Box, Film, Palette, Volume2, Music, ShieldCheck, CheckCircle2, Loader } from 'lucide-react';
import { eventBus } from '../../core/EventBus';

export const ProjectOverviewView: React.FC = () => {
  const [project, setProject] = useState<MioProject>(ProjectManager.getProject());
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [pipelineSteps, setPipelineSteps] = useState<CreativePlanStep[]>([]);

  useEffect(() => {
    const unsub = eventBus.on('PROJECT_UPDATED', (proj: MioProject) => setProject({ ...proj }));
    return unsub;
  }, []);

  const runCompositePipeline = async () => {
    setPipelineRunning(true);
    const steps = CreativeOrchestrator.planCreativePipeline(
      'Create a 3d futuristic drone, animate locomotion hovering, synthesize laser sound effects, compose cyberpunk background music, and design a technical poster'
    );
    setPipelineSteps(steps);

    await CreativeOrchestrator.executePipeline(steps, (idx, step) => {
      setPipelineSteps([...steps]);
    });

    setPipelineRunning(false);
    VersionManager.takeSnapshot('Multi-mode automated pipeline execution');
  };

  const getAssetIcon = (type: ProjectAsset['type']) => {
    switch (type) {
      case '3d': return <Box size={14} className="text-cyan-400" />;
      case 'animation': return <Film size={14} className="text-purple-400" />;
      case 'graphic': return <Palette size={14} className="text-amber-400" />;
      case 'sfx': return <Volume2 size={14} className="text-blue-400" />;
      case 'music': return <Music size={14} className="text-emerald-400" />;
      default: return <FolderGit2 size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-6">
      {/* Project Meta Card */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderGit2 size={18} className="text-cyan-400" />
            <span className="text-white font-bold text-base">{project.name}</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              .mioproject
            </span>
          </div>
          <p className="text-gray-400 max-w-2xl text-[11px]">{project.description}</p>
        </div>

        <button
          disabled={pipelineRunning}
          onClick={runCompositePipeline}
          className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold rounded-lg flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20"
        >
          {pipelineRunning ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
          <span>{pipelineRunning ? 'PIPELINE RUNNING...' : 'RUN FULL CREATIVE PIPELINE'}</span>
        </button>
      </div>

      {/* Multi-Mode Pipeline Visual Progress */}
      {pipelineSteps.length > 0 && (
        <div className="bg-[#0d121d] p-4 rounded-xl border border-cyan-500/30">
          <span className="text-cyan-400 font-bold block mb-3 text-[11px]">
            MULTI-MODE CREATIVE ORCHESTRATION PIPELINE
          </span>
          <div className="grid grid-cols-5 gap-2">
            {pipelineSteps.map((step, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border text-center ${
                  step.status === 'completed'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : step.status === 'in_progress'
                    ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300 animate-pulse'
                    : 'bg-[#111726] border-gray-800 text-gray-500'
                }`}
              >
                <div className="font-bold text-[10px] mb-1">{step.mode}</div>
                <div className="text-[9px] truncate">{step.assetName}</div>
                <div className="text-[9px] mt-1 font-bold uppercase">{step.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset Sandbox Explorer */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-300 font-bold flex items-center gap-2">
            PROJECT ASSET SANDBOX ({project.assets.length})
          </span>
          <span className="text-[10px] text-gray-500">ISOLATED WITHIN /PROJECT/ GENERATED DIRECTORY</span>
        </div>

        <div className="space-y-2">
          {project.assets.map((asset) => (
            <div
              key={asset.id}
              className="p-3 bg-[#111726] rounded-lg border border-gray-800 flex items-center justify-between hover:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-black/40 border border-gray-800">
                  {getAssetIcon(asset.type)}
                </div>
                <div>
                  <span className="text-white font-bold block">{asset.name}</span>
                  <span className="text-gray-500 text-[10px]">{asset.filePath} // v{asset.version}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-bold">
                  {asset.origin}
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck size={10} /> VERIFIED
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Version Snapshots & Rollback */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-300 font-bold">VERSION HISTORY &amp; ROLLBACK ({project.versions.length})</span>
          <button
            onClick={() => VersionManager.takeSnapshot('Manual user snapshot')}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-cyan-300 rounded text-[10px] border border-gray-700 cursor-pointer"
          >
            CREATE SNAPSHOT
          </button>
        </div>

        {project.versions.length === 0 ? (
          <div className="text-gray-500 text-center p-3">No snapshots recorded yet</div>
        ) : (
          <div className="space-y-2">
            {project.versions.map((ver) => (
              <div
                key={ver.versionId}
                className="flex items-center justify-between p-2.5 bg-[#111726] rounded border border-gray-800"
              >
                <div>
                  <span className="text-cyan-300 font-bold block">{ver.description}</span>
                  <span className="text-gray-500 text-[10px]">
                    {new Date(ver.timestamp).toLocaleTimeString()} // {ver.versionId}
                  </span>
                </div>

                <button
                  onClick={() => VersionManager.rollbackToVersion(ver.versionId)}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-cyan-950 text-cyan-300 rounded border border-gray-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={12} /> Rollback
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
