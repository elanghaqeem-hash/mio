import React, { useState } from 'react';
import { Folder, File, Copy, Trash2, RotateCcw, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { PermissionEngine } from '../../security/PermissionEngine';
import { eventBus } from '../../core/EventBus';

interface ManagedFile {
  id: string;
  name: string;
  category: '3D' | 'ANIMATION' | 'GRAPHIC' | 'AUDIO' | 'DOCUMENT';
  sizeKb: number;
  duplicateOf?: string;
  suggestedPath: string;
}

export const FileOrganizationView: React.FC = () => {
  const [files, setFiles] = useState<ManagedFile[]>([
    { id: 'f1', name: 'vanguard_mesh_backup_v1.obj', category: '3D', sizeKb: 2450, duplicateOf: 'vanguard_mesh_final.obj', suggestedPath: 'PROJECT/ARCHIVE/vanguard_mesh_backup_v1.obj' },
    { id: 'f2', name: 'thruster_laser_raw.wav', category: 'AUDIO', sizeKb: 1240, suggestedPath: 'PROJECT/SFX/thruster_laser_raw.wav' },
    { id: 'f3', name: 'briefing_poster_draft.png', category: 'GRAPHIC', sizeKb: 3100, suggestedPath: 'PROJECT/GRAPHIC/briefing_poster_draft.png' },
    { id: 'f4', name: 'notes_temp.txt', category: 'DOCUMENT', sizeKb: 14, suggestedPath: 'PROJECT/DOCS/notes_temp.txt' },
  ]);

  const [transactionLog, setTransactionLog] = useState<string[]>([
    'Directory indexed: 4 project files within sandbox',
  ]);

  const handleOrganize = async () => {
    const authorized = await PermissionEngine.requestPermission({
      action: 'BATCH_FILE_REORGANIZATION',
      target: 'PROJECT/ directory structure',
      level: 'L3_MODIFY',
      changes: files.map((f) => `Move "${f.name}" to "${f.suggestedPath}"`),
      risks: ['Moves 4 files to categorized subdirectories'],
      expectedResult: 'Clean semantic hierarchy established',
    });

    if (authorized) {
      setTransactionLog((prev) => [
        `Executed reorganization: 4 files organized into semantic folders`,
        ...prev,
      ]);
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: 'Organized workspace files into structured project sandbox directories',
        mode: 'FILES',
      });
    }
  };

  const handleRollback = () => {
    setTransactionLog((prev) => ['Rollback executed: Restored original directory layout', ...prev]);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Folder size={16} />
          <span className="font-bold text-sm">FILE ORGANIZATION WORKSPACE // SANDBOX MANAGEMENT</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRollback}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={13} /> Rollback
          </button>
          <button
            onClick={handleOrganize}
            className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/20"
          >
            <CheckCircle2 size={14} /> Execute Organization
          </button>
        </div>
      </div>

      {/* File Classification Table */}
      <div className="flex-1 bg-[#0d121d] rounded-xl border border-gray-800 overflow-hidden flex flex-col mb-4">
        <div className="grid grid-cols-12 bg-[#111726] p-3 border-b border-gray-800 font-bold text-gray-400">
          <div className="col-span-4">FILE NAME</div>
          <div className="col-span-2">TYPE</div>
          <div className="col-span-2">SIZE</div>
          <div className="col-span-4">SUGGESTED PATH</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {files.map((file) => (
            <div
              key={file.id}
              className="grid grid-cols-12 p-3 border-b border-gray-800/60 hover:bg-gray-800/20 items-center text-gray-300"
            >
              <div className="col-span-4 flex items-center gap-2 truncate">
                <File size={14} className="text-cyan-400" />
                <span className="truncate">{file.name}</span>
                {file.duplicateOf && (
                  <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                    <Copy size={10} /> Duplicate
                  </span>
                )}
              </div>
              <div className="col-span-2 text-cyan-300 font-bold">{file.category}</div>
              <div className="col-span-2 text-gray-400">{file.sizeKb} KB</div>
              <div className="col-span-4 text-emerald-400 truncate flex items-center gap-1">
                <ArrowRight size={12} /> {file.suggestedPath}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Log */}
      <div className="h-36 bg-[#0a0e17] rounded-xl border border-gray-800 p-3 overflow-y-auto">
        <span className="text-gray-400 font-bold block mb-2 text-[11px]">TRANSACTION AUDIT LOG</span>
        <div className="space-y-1 text-[10px] text-gray-400">
          {transactionLog.map((log, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-cyan-500">[{new Date().toLocaleTimeString()}]</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
