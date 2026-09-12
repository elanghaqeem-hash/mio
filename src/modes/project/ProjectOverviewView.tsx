import React, { useEffect, useState } from 'react';
import { ProjectManager } from '../../project/ProjectManager';
import { VersionManager } from '../../project/VersionManager';
import { CreativeOrchestrator, CreativePlanStep } from '../../agents/CreativeOrchestrator';
import { MioProject, ProjectAsset } from '../../types/project';
import { FolderGit2, Play, RotateCcw, Box, Film, Palette, Volume2, Music, Loader } from 'lucide-react';
import { eventBus } from '../../core/EventBus';

export const ProjectOverviewView: React.FC = () => {
  const [project, setProject] = useState<MioProject>(ProjectManager.getProject());
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<CreativePlanStep[]>([]);
  const [brief, setBrief] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => eventBus.on('PROJECT_UPDATED', (p: MioProject) => setProject({ ...p })), []);

  const runPipeline = async () => {
    const prompt = brief.trim();
    if (!prompt) { setMessage('Enter a procedural creative brief first.'); return; }
    const planned = CreativeOrchestrator.planCreativePipeline(prompt);
    if (!planned.length) { setMessage('No supported native creative operation detected.'); return; }
    setRunning(true); setSteps(planned); setMessage('Running native procedural tools. This is not represented as cloud-AI generation.');
    const ok = await CreativeOrchestrator.executePipeline(planned, () => setSteps([...planned]));
    setRunning(false);
    if (ok) { VersionManager.takeSnapshot(`Procedural pipeline: ${prompt.slice(0,120)}`); setMessage('Pipeline completed and project state persisted.'); }
    else setMessage('Pipeline failed or was stopped.');
  };

  const icon = (type: ProjectAsset['type']) => type==='3d'?<Box size={14}/>:type==='animation'?<Film size={14}/>:type==='graphic'?<Palette size={14}/>:type==='sfx'?<Volume2 size={14}/>:type==='music'?<Music size={14}/>:<FolderGit2 size={14}/>;

  return <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-5">
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><div className="flex gap-2 items-center"><FolderGit2 size={18} className="text-cyan-400"/><span className="text-white font-bold text-base">{project.name}</span></div><p className="text-gray-400 mt-1">{project.description}</p></div>
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3"><div className="font-bold text-cyan-300">NATIVE PROCEDURAL PIPELINE</div><p className="text-[10px] text-gray-500">Creates structured assets using MIO's local procedural engines. It does not claim semantic generative-AI behavior.</p><textarea value={brief} onChange={(e)=>setBrief(e.target.value)} placeholder="Example: create a 3D drone, animation, sound effect, music and poster" className="w-full min-h-20 bg-[#111726] border border-gray-700 rounded p-3 text-white"/><button disabled={running} onClick={runPipeline} className="px-5 py-2 bg-cyan-500 text-black font-bold rounded flex gap-2 disabled:opacity-50">{running?<Loader size={15} className="animate-spin"/>:<Play size={15}/>}RUN PROCEDURAL PIPELINE</button>{message&&<div className="text-gray-300">{message}</div>}</div>
    {steps.length>0&&<div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 grid grid-cols-2 md:grid-cols-5 gap-2">{steps.map((s,i)=><div key={i} className="p-2 bg-[#111726] rounded border border-gray-800"><div className="text-cyan-300 font-bold">{s.mode}</div><div className="text-gray-500 truncate">{s.assetName}</div><div className="text-[9px] uppercase mt-1">{s.status}</div></div>)}</div>}
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><div className="font-bold text-gray-300 mb-3">PERSISTED PROJECT ASSETS ({project.assets.length})</div>{project.assets.length===0?<div className="text-gray-500">No generated or imported assets yet.</div>:<div className="space-y-2">{project.assets.map(a=><div key={a.id} className="p-3 bg-[#111726] rounded border border-gray-800 flex justify-between"><div className="flex gap-3 items-center text-cyan-400">{icon(a.type)}<div><span className="text-white block">{a.name}</span><span className="text-gray-500 text-[10px]">{a.filePath} // v{a.version}</span></div></div><span className={`text-[9px] ${a.verified?'text-emerald-400':'text-amber-400'}`}>{a.verified?'VALIDATED':'UNVERIFIED'}</span></div>)}</div>}</div>
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800"><div className="flex justify-between mb-3"><span className="font-bold text-gray-300">VERSION HISTORY ({project.versions.length})</span><button onClick={()=>VersionManager.takeSnapshot('Manual snapshot')} className="px-2 py-1 bg-gray-800 text-cyan-300 rounded">CREATE SNAPSHOT</button></div>{project.versions.length===0?<div className="text-gray-500">No snapshots yet.</div>:project.versions.map(v=><div key={v.versionId} className="flex justify-between p-2 bg-[#111726] rounded border border-gray-800 mb-2"><div><div className="text-cyan-300">{v.description}</div><div className="text-gray-500 text-[10px]">{new Date(v.timestamp).toLocaleString()}</div></div><button onClick={()=>VersionManager.rollbackToVersion(v.versionId)} className="px-2 py-1 bg-gray-800 text-cyan-300 rounded flex gap-1"><RotateCcw size={12}/>Rollback</button></div>)}</div>
  </div>;
};
