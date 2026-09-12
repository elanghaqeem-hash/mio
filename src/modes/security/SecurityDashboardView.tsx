import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, CheckCircle, Database, Eye, Trash2, Edit2, Lock, Cpu, Globe, Mic, Camera } from 'lucide-react';
import { MioMemoryManager } from '../../security/MemoryManager';
import { MemoryItem, SecurityEvent } from '../../types/security';
import { eventBus } from '../../core/EventBus';

export const SecurityDashboardView: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>(MioMemoryManager.getMemories());
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([
    {
      id: 'sec_init_1',
      timestamp: Date.now() - 7200000,
      level: 'info',
      category: 'PERMISSION',
      action: 'SYSTEM_BOOT',
      details: 'L0-L5 Permission Engine initialized. Default: ASSISTIVE mode.',
      blocked: false,
    },
    {
      id: 'sec_init_2',
      timestamp: Date.now() - 3600000,
      level: 'blocked',
      category: 'PROMPT_INJECTION',
      action: 'INPUT_SCAN',
      details: 'Evaluated instruction boundaries: Zero system overrides detected.',
      blocked: false,
    },
  ]);

  useEffect(() => {
    const unsubMem = eventBus.on('MEMORY_UPDATED', (mems: MemoryItem[]) => setMemories(mems));
    const unsubSec = eventBus.on('SECURITY_EVENT', (event: SecurityEvent) => {
      setSecurityEvents((prev) => [event, ...prev]);
    });

    return () => {
      unsubMem();
      unsubSec();
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-y-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Shield size={16} />
          <span className="font-bold text-sm">SECURITY CONTROL CENTER // PERMISSION HIERARCHY L0-L5</span>
        </div>
        <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
          SECURITY LEVEL: ENFORCED
        </span>
      </div>

      {/* Permission Tiers Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 flex items-center gap-3">
          <Mic size={20} className="text-gray-500" />
          <div>
            <span className="text-gray-400 text-[10px] block">MICROPHONE</span>
            <span className="text-amber-400 font-bold">EXPLICIT PUSH-TO-TALK</span>
          </div>
        </div>

        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 flex items-center gap-3">
          <Camera size={20} className="text-gray-500" />
          <div>
            <span className="text-gray-400 text-[10px] block">OPTICAL CAMERA</span>
            <span className="text-gray-400 font-bold">OFF BY DEFAULT</span>
          </div>
        </div>

        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 flex items-center gap-3">
          <Globe size={20} className="text-gray-500" />
          <div>
            <span className="text-gray-400 text-[10px] block">NETWORK DATA</span>
            <span className="text-cyan-400 font-bold">SANDBOX ISOLATED</span>
          </div>
        </div>

        <div className="bg-[#0d121d] p-3 rounded-xl border border-gray-800 flex items-center gap-3">
          <Cpu size={20} className="text-gray-500" />
          <div>
            <span className="text-gray-400 text-[10px] block">TOOL EXECUTION</span>
            <span className="text-emerald-400 font-bold">VALIDATED SANDBOX</span>
          </div>
        </div>
      </div>

      {/* Controlled Memory Manager */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-300 font-bold flex items-center gap-2">
            <Database size={14} className="text-cyan-400" /> CONTROLLED LONG-TERM MEMORY ({memories.length})
          </span>
          <button
            onClick={() => MioMemoryManager.clearAll()}
            className="px-2 py-1 bg-gray-800 hover:bg-red-950/60 text-red-400 rounded border border-gray-700 text-[10px] cursor-pointer"
          >
            CLEAR ALL MEMORY
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {memories.map((mem) => (
            <div
              key={mem.id}
              className="flex items-center justify-between p-2.5 bg-[#111726] rounded border border-gray-800"
            >
              <div className="truncate pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                    {mem.category}
                  </span>
                  <span className="text-[10px] text-gray-500">Confidence: {(mem.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-gray-300 truncate">{mem.content}</p>
              </div>

              <button
                onClick={() => MioMemoryManager.deleteMemory(mem.id)}
                className="p-1.5 text-gray-500 hover:text-red-400 rounded"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Security Audit Events Log */}
      <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 flex-1">
        <span className="text-gray-300 font-bold block mb-3 flex items-center gap-2">
          <ShieldAlert size={14} className="text-amber-400" /> REAL-TIME SECURITY AUDIT LOG
        </span>

        <div className="space-y-2 max-h-56 overflow-y-auto">
          {securityEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-2.5 bg-[#111726] rounded border border-gray-800 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      evt.level === 'blocked'
                        ? 'bg-red-950 text-red-400 border border-red-500/30'
                        : evt.level === 'warning'
                        ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                        : 'bg-cyan-950 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    {evt.action}
                  </span>
                  <span className="text-gray-500 text-[10px]">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-300">{evt.details}</p>
              </div>

              <span className="text-[10px] font-bold text-gray-400 uppercase">
                {evt.blocked ? 'BLOCKED' : 'PERMITTED'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
