import React, { useEffect, useState } from 'react';
import { ProjectManager } from '../../project/ProjectManager';
import { VersionManager } from '../../project/VersionManager';
import { CreativeOrchestrator, CreativePlanStep } from '../../agents/CreativeOrchestrator';
import { MioProject, ProjectAsset } from '../../types/project';
import { FolderGit2, Play, RotateCcw, Box, Film, Palette, Volume2, Music, ShieldAlert, ShieldCheck, Loader, Workflow, GitBranch, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { KnowledgeGovernancePanel } from './KnowledgeGovernancePanel';
import { KnowledgeCorroborationPanel } from './KnowledgeCorroborationPanel';
import { KnowledgeLineagePanel } from './KnowledgeLineagePanel';
import { KnowledgeReviewInboxPanel } from './KnowledgeReviewInboxPanel';

export const ProjectOverviewView: React.FC = () => {
  const [project, setProject] = useState<MioProject>(ProjectManager.getProject());
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [pipelineSteps, setPipelineSteps] = useState<CreativePlanStep[]>([]);

  useEffect(() => eventBus.on('PROJECT_UPDATED', (proj: MioProject) => setProject({ ...proj })), []);

  const runCompositePipeline = async () => {
    setPipelineRunning(true);
    const steps = CreativeOrchestrator.planCreativePipeline('Create a 3d futuristic drone, animate locomotion hovering, synthesize laser sound effects, compose cyberpunk background music, and design a technical poster');
    setPipelineSteps(steps);
    try {
      await CreativeOrchestrator.executePipeline(steps, () => setPipelineSteps([...steps]));
    } finally {
      setPipelineRunning(false);
    }
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

  const getAssetTrust = (asset: ProjectAsset) => {
    if (asset.type === 'document') return project.knowledgeGovernance.sources[asset.id]?.trust ?? (asset.verified ? 'VERIFIED' : 'QUARANTINED');
    return asset.verified ? 'VERIFIED' : 'UNVERIFIED';
  };

  const pipelineStatusClass = (status: string) => {
    if (status === 'COMPLETED') return 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300';
    if (status === 'RUNNING') return 'border-cyan-500/30 bg-cyan-950/30 text-cyan-300';
    if (status === 'FAILED' || status === 'CANCELLED') return 'border-red-500/30 bg-red-950/30 text-red-300';
    return 'border-gray-700 bg-[#111726] text-gray-400';
  };

  return (
    <div className="flex h-full w-full flex-col space-y-6 overflow-y-auto bg-[#07090e] p-4 font-mono text-xs">
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div>
          <div className="mb-1 flex items-center gap-2"><FolderGit2 size={18} className="text-cyan-400" /><span className="text-base font-bold text-white">{project.name}</span><span className="rounded border border-cyan-500/30 bg-cyan-950 px-2 py-0.5 text-[10px] text-cyan-300">.mioproject</span></div>
          <p className="max-w-2xl text-[11px] text-gray-400">{project.description}</p>
        </div>
        <button disabled={pipelineRunning} onClick={runCompositePipeline} className="flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 font-bold text-black shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 disabled:opacity-50">{pipelineRunning ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}<span>{pipelineRunning ? 'PIPELINE RUNNING...' : 'RUN FULL CREATIVE PIPELINE'}</span></button>
      </div>

      {pipelineSteps.length > 0 && <div className="rounded-xl border border-cyan-500/30 bg-[#0d121d] p-4"><span className="mb-3 block text-[11px] font-bold text-cyan-400">LIVE CROSS-MODE PIPELINE</span><div className="grid grid-cols-5 gap-2">{pipelineSteps.map((step) => <div key={step.id} className={`rounded-lg border p-2.5 text-center ${step.status === 'completed' ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300' : step.status === 'in_progress' ? 'animate-pulse border-cyan-500/60 bg-cyan-950/40 text-cyan-300' : step.status === 'failed' || step.status === 'blocked' ? 'border-red-500/40 bg-red-950/30 text-red-300' : 'border-gray-800 bg-[#111726] text-gray-500'}`}><div className="mb-1 text-[10px] font-bold">{step.mode}</div><div className="truncate text-[9px]">{step.assetName}</div><div className="mt-1 text-[9px] font-bold uppercase">{step.status}</div></div>)}</div></div>}

      <div className="rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-gray-300"><Workflow size={15} className="text-cyan-400" />CREATIVE PIPELINE HISTORY ({project.creativePipelines?.length ?? 0})</span><span className="text-[10px] text-gray-500">PERSISTENT PROJECT EXECUTION RECORD</span></div>
        {!project.creativePipelines?.length ? <div className="p-3 text-center text-gray-500">No creative pipeline execution recorded yet</div> : <div className="space-y-3">{project.creativePipelines.map((pipeline) => <div key={pipeline.id} className="rounded-lg border border-gray-800 bg-[#111726] p-3"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><GitBranch size={13} className="text-cyan-400" /><span className="font-bold text-white">{pipeline.id}</span><span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${pipelineStatusClass(pipeline.status)}`}>{pipeline.status}</span></div><p className="mt-1 max-w-3xl text-[10px] text-gray-400">{pipeline.prompt}</p></div><div className="text-right text-[9px] text-gray-500"><div>{new Date(pipeline.createdAt).toLocaleString()}</div>{pipeline.snapshotVersionId && <div className="mt-1 text-cyan-400">snapshot: {pipeline.snapshotVersionId}</div>}</div></div><div className="grid gap-2 md:grid-cols-5">{pipeline.steps.map((step) => <div key={step.id} className={`rounded border p-2 ${pipelineStatusClass(step.status)}`}><div className="flex items-center justify-between gap-1"><span className="text-[9px] font-bold">{step.mode}</span>{step.status === 'COMPLETED' ? <CheckCircle2 size={11} /> : step.status === 'FAILED' ? <XCircle size={11} /> : step.status === 'BLOCKED' || step.status === 'CANCELLED' ? <Ban size={11} /> : null}</div><div className="mt-1 truncate text-[9px]">{step.assetName}</div><div className="mt-1 text-[8px] opacity-80">deps: {step.dependsOnStepIds.length ? step.dependsOnStepIds.join(', ') : 'none'}</div>{step.outputAssetId && <div className="mt-1 truncate text-[8px] text-cyan-300">asset: {step.outputAssetId}</div>}{step.validation && <div className="mt-1 text-[8px]">validation: {step.validation.valid ? 'PASS' : 'FAIL'}</div>}{step.error && <div className="mt-1 text-[8px] text-red-300">{step.error}</div>}</div>)}</div><div className="mt-3 border-t border-gray-800 pt-2 text-[9px] text-gray-500">{pipeline.disclosure}</div></div>)}</div>}
      </div>

      <KnowledgeReviewInboxPanel project={project} />
      <KnowledgeGovernancePanel project={project} />
      <KnowledgeCorroborationPanel project={project} />
      <KnowledgeLineagePanel project={project} />

      <div className="rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-gray-300">PROJECT ASSET SANDBOX ({project.assets.length})</span><span className="text-[10px] text-gray-500">PROJECT-SCOPED ASSET INVENTORY</span></div>
        <div className="space-y-2">
          {project.assets.length === 0 && <div className="p-3 text-center text-gray-500">No assets in this project yet</div>}
          {project.assets.map((asset) => {
            const trust = getAssetTrust(asset);
            return <div key={asset.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#111726] p-3 hover:border-gray-700"><div className="flex items-center gap-3"><div className="rounded border border-gray-800 bg-black/40 p-2">{getAssetIcon(asset.type)}</div><div><span className="block font-bold text-white">{asset.name}</span><span className="text-[10px] text-gray-500">{asset.filePath || `project-asset://${asset.id}`} // v{asset.version}</span></div></div><div className="flex items-center gap-2"><span className="rounded border border-cyan-500/30 bg-cyan-950 px-2 py-0.5 text-[9px] font-bold text-cyan-300">{asset.origin}</span><span className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] ${trust === 'VERIFIED' ? 'border-emerald-500/30 bg-emerald-950 text-emerald-400' : 'border-amber-500/30 bg-amber-950 text-amber-300'}`}>{trust === 'VERIFIED' ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}{trust}</span></div></div>;
          })}
        </div>
      </div>

      <div className="rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="font-bold text-gray-300">VERSION HISTORY &amp; ROLLBACK ({project.versions.length})</span><button onClick={() => VersionManager.takeSnapshot('Manual user snapshot')} className="cursor-pointer rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[10px] text-cyan-300 hover:bg-gray-700">CREATE SNAPSHOT</button></div>
        {project.versions.length === 0 ? <div className="p-3 text-center text-gray-500">No snapshots recorded yet</div> : <div className="space-y-2">{project.versions.map((ver) => <div key={ver.versionId} className="flex items-center justify-between rounded border border-gray-800 bg-[#111726] p-2.5"><div><span className="block font-bold text-cyan-300">{ver.description}</span><span className="text-[10px] text-gray-500">{new Date(ver.timestamp).toLocaleString()} // {ver.versionId}</span></div><button onClick={() => VersionManager.rollbackToVersion(ver.versionId)} className="flex cursor-pointer items-center gap-1.5 rounded border border-gray-700 bg-gray-800 px-2.5 py-1 text-cyan-300 hover:bg-cyan-950"><RotateCcw size={12} /> Rollback</button></div>)}</div>}
      </div>
    </div>
  );
};
