import React, { useEffect, useState } from 'react';
import { Folder, File, RotateCcw, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react';
import { PermissionEngine } from '../../security/PermissionEngine';

interface ManagedFile { name: string; category: string; sourcePath: string; suggestedPath: string; }
interface MoveRecord { from: string; to: string; }

function categoryFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  if (['obj','glb','gltf','fbx','stl'].includes(ext)) return '3D';
  if (['wav','mp3','ogg','m4a'].includes(ext)) return 'AUDIO';
  if (['png','jpg','jpeg','svg','webp'].includes(ext)) return 'GRAPHIC';
  if (['json','mioproject','mioanim','mio3d','miosfx','miomusic','mioart'].includes(ext)) return 'MIO';
  return 'DOCUMENTS';
}

export const FileOrganizationView: React.FC = () => {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    if (!window.mioDesktop) return;
    setBusy(true);
    try {
      let root = await window.mioDesktop.getWorkspace();
      if (!root) root = await window.mioDesktop.selectDirectory();
      setWorkspace(root || null);
      if (!root) { setFiles([]); return; }
      const result = await window.mioDesktop.listDirectory(root);
      if (!result.success) throw new Error(result.error);
      const rows: ManagedFile[] = (result.files || []).filter((x: any) => x.type === 'file').map((x: any) => {
        const category = categoryFor(x.name);
        const sep = root.includes('\\') ? '\\' : '/';
        return { name: x.name, category, sourcePath: `${root}${sep}${x.name}`, suggestedPath: `${root}${sep}${category}${sep}${x.name}` };
      });
      setFiles(rows); setLog((prev) => [`Scanned ${rows.length} regular files from authorized workspace`, ...prev]);
    } catch (err: any) { setLog((prev) => [`SCAN FAILED: ${err?.message || String(err)}`, ...prev]); }
    finally { setBusy(false); }
  };

  useEffect(() => { void scan(); }, []);

  const organize = async () => {
    if (!window.mioDesktop || !workspace || files.length === 0) return;
    const approved = await PermissionEngine.requestPermission({ action: 'BATCH_FILE_REORGANIZATION', target: workspace, level: 'L4_EXECUTE', changes: files.map((f) => `${f.sourcePath} -> ${f.suggestedPath}`), risks: ['Moves files inside the authorized workspace; overwrite remains blocked'], expectedResult: `${files.length} files categorized` });
    if (!approved) return;
    setBusy(true);
    const completed: MoveRecord[] = [];
    try {
      for (const file of files) {
        const result = await window.mioDesktop.moveFile(file.sourcePath, file.suggestedPath);
        if (!result.success) throw new Error(`${file.name}: ${result.error}`);
        completed.push({ from: file.sourcePath, to: file.suggestedPath });
      }
      setHistory(completed); setLog((prev) => [`Moved ${completed.length} files successfully. Rollback is available for this transaction.`, ...prev]);
      await scan();
    } catch (err: any) {
      setLog((prev) => [`ORGANIZE FAILED after ${completed.length} moves: ${err?.message || String(err)}. Use rollback for completed moves.`, ...prev]);
      setHistory(completed);
    } finally { setBusy(false); }
  };

  const rollback = async () => {
    if (!window.mioDesktop || history.length === 0) return;
    const approved = await PermissionEngine.requestPermission({ action: 'ROLLBACK_FILE_REORGANIZATION', target: workspace || 'workspace', level: 'L4_EXECUTE', changes: history.map((m) => `${m.to} -> ${m.from}`), risks: ['Restores files to their original paths; overwrite remains blocked'], expectedResult: 'Restore previous workspace layout' });
    if (!approved) return;
    setBusy(true);
    try {
      for (const move of [...history].reverse()) {
        const result = await window.mioDesktop.moveFile(move.to, move.from);
        if (!result.success) throw new Error(result.error);
      }
      setHistory([]); setLog((prev) => ['Rollback completed successfully.', ...prev]); await scan();
    } catch (err: any) { setLog((prev) => [`ROLLBACK FAILED: ${err?.message || String(err)}`, ...prev]); }
    finally { setBusy(false); }
  };

  return <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
    <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800"><div className="flex items-center gap-2 text-cyan-300"><Folder size={16}/><span className="font-bold text-sm">FILE SANDBOX // REAL WORKSPACE OPERATIONS</span></div><div className="flex gap-2"><button onClick={scan} disabled={busy} className="px-3 py-1.5 bg-gray-800 rounded text-gray-300 flex gap-1"><RefreshCw size={13}/>Scan</button><button onClick={rollback} disabled={busy||history.length===0} className="px-3 py-1.5 bg-gray-800 rounded text-gray-300 disabled:opacity-40 flex gap-1"><RotateCcw size={13}/>Rollback</button><button onClick={organize} disabled={busy||files.length===0} className="px-4 py-1.5 bg-cyan-500 text-black font-bold rounded disabled:opacity-40 flex gap-1"><CheckCircle2 size={14}/>Execute</button></div></div>
    <div className="mb-3 text-[10px] text-gray-500 break-all">AUTHORIZED WORKSPACE: {workspace || 'NONE — select a workspace to enable file operations'}</div>
    <div className="flex-1 bg-[#0d121d] rounded-xl border border-gray-800 overflow-hidden flex flex-col mb-4"><div className="grid grid-cols-12 bg-[#111726] p-3 border-b border-gray-800 font-bold text-gray-400"><div className="col-span-5">FILE</div><div className="col-span-2">CATEGORY</div><div className="col-span-5">TARGET</div></div><div className="flex-1 overflow-y-auto">{files.length===0?<div className="p-6 text-center text-gray-500">No regular files found at workspace root.</div>:files.map((f)=><div key={f.sourcePath} className="grid grid-cols-12 p-3 border-b border-gray-800/60 text-gray-300"><div className="col-span-5 flex gap-2 truncate"><File size={14} className="text-cyan-400"/><span className="truncate">{f.name}</span></div><div className="col-span-2 text-cyan-300">{f.category}</div><div className="col-span-5 text-emerald-400 truncate flex gap-1"><ArrowRight size={12}/>{f.suggestedPath}</div></div>)}</div></div>
    <div className="h-36 bg-[#0a0e17] rounded-xl border border-gray-800 p-3 overflow-y-auto"><span className="text-gray-400 font-bold block mb-2">TRANSACTION LOG</span>{log.map((x,i)=><div key={i} className="text-[10px] text-gray-400 mb-1">{x}</div>)}</div>
  </div>;
};
