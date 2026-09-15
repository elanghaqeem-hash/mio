import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Database, Trash2, KeyRound, Ban, Clock3 } from 'lucide-react';
import { MioMemoryManager } from '../../security/MemoryManager';
import { PermissionEngine } from '../../security/PermissionEngine';
import { PERMISSION_LEVEL_POLICIES } from '../../security/PermissionPolicy';
import { securityAuditLog } from '../../security/SecurityAuditLog';
import { GovernedMemoryActions } from '../../security/GovernedMemoryActions';
import type { AuthorizationGrant, MemoryItem, SecurityEvent } from '../../types/security';
import { eventBus } from '../../core/EventBus';

export const SecurityDashboardView: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>(MioMemoryManager.getMemories());
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>(securityAuditLog.getEvents());
  const [activeGrants, setActiveGrants] = useState<AuthorizationGrant[]>(PermissionEngine.getActiveGrants());

  useEffect(() => {
    const unsubMem = eventBus.on<MemoryItem[]>('MEMORY_UPDATED', (mems) => setMemories(mems));
    const unsubSec = eventBus.on<SecurityEvent[]>('SECURITY_AUDIT_UPDATED', (events) => setSecurityEvents(events));
    const unsubGrants = eventBus.on<AuthorizationGrant[]>('AUTHORIZATION_GRANTS_UPDATED', (grants) => setActiveGrants(grants));
    return () => { unsubMem(); unsubSec(); unsubGrants(); };
  }, []);

  return (
    <div className="flex h-full w-full flex-col space-y-6 overflow-y-auto bg-[#07090e] p-4 font-mono text-xs">
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3">
        <div className="flex items-center gap-2 text-cyan-300"><Shield size={16} /><span className="text-sm font-bold">SECURITY CONTROL CENTER // PERMISSION HIERARCHY L0-L5</span></div>
        <span className="rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-bold text-cyan-300">ACTIVE SCOPED GRANTS: {activeGrants.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {PERMISSION_LEVEL_POLICIES.map((policy) => (
          <div key={policy.level} className={`rounded-xl border p-3 ${policy.destructive ? 'border-red-500/30 bg-red-950/10' : policy.level === 'L4_EXECUTE' ? 'border-amber-500/30 bg-amber-950/10' : 'border-gray-800 bg-[#0d121d]'}`}>
            <div className="mb-2 flex items-center justify-between gap-2"><span className="font-bold text-cyan-300">{policy.level.split('_')[0]}</span><span className="text-[9px] text-gray-500">{policy.label.toUpperCase()}</span></div>
            <p className="min-h-16 text-[10px] leading-relaxed text-gray-400">{policy.description}</p>
            <div className={`mt-2 rounded border px-2 py-1 text-[9px] ${policy.approvalMode === 'AUTO_SCOPED' ? 'border-gray-700 text-gray-400' : 'border-amber-500/30 text-amber-300'}`}>{policy.approvalMode.replaceAll('_', ' ')}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-gray-300"><KeyRound size={14} className="text-cyan-400" /> ACTIVE AUTHORIZATION GRANTS ({activeGrants.length})</span>{activeGrants.length > 0 && <button onClick={() => PermissionEngine.revokeAll('User revoked all grants from Security Control Center')} className="flex cursor-pointer items-center gap-1.5 rounded border border-red-500/30 bg-red-950/20 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950/40"><Ban size={11} /> REVOKE ALL</button>}</div>
        {activeGrants.length === 0 ? <div className="p-3 text-center text-gray-500">No active authorization grants. MIO has no reusable execution authority.</div> : <div className="space-y-2">{activeGrants.map((grant) => <div key={grant.id} className="rounded-lg border border-gray-800 bg-[#111726] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded border border-cyan-500/30 bg-cyan-950 px-2 py-0.5 text-[9px] font-bold text-cyan-300">{grant.level}</span>{grant.reusableAcrossTasks && <span className="rounded border border-amber-500/30 bg-amber-950 px-2 py-0.5 text-[9px] font-bold text-amber-300">SESSION</span>}<span className="truncate font-bold text-white">{grant.scope.action}</span></div><div className="mt-1 text-[10px] text-gray-400">{grant.scope.target}</div><div className="mt-2 flex flex-wrap gap-2 text-[9px] text-gray-500"><span>{grant.reusableAcrossTasks ? 'approved from task' : 'task'}: {grant.scope.taskId}</span>{grant.scope.projectId && <span>project: {grant.scope.projectId}</span>}{grant.scope.resourceId && <span>resource: {grant.scope.resourceId}</span>}</div></div><button onClick={() => PermissionEngine.revokeGrant(grant.id, 'User revoked grant from Security Control Center')} className="shrink-0 cursor-pointer rounded border border-red-500/30 px-2 py-1 text-[9px] text-red-300 hover:bg-red-950/30">REVOKE</button></div><div className="mt-2 flex flex-wrap items-center gap-3 border-t border-gray-800 pt-2 text-[9px] text-gray-500"><span className="flex items-center gap-1"><Clock3 size={10} /> expires {new Date(grant.expiresAt).toLocaleTimeString()}</span><span>uses {grant.uses}/{grant.maxUses}</span>{grant.absoluteExpiresAt && <span>absolute limit {new Date(grant.absoluteExpiresAt).toLocaleTimeString()}</span>}<span>source {grant.source}</span></div></div>)}</div>}
      </div>

      <div className="rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-gray-300"><Database size={14} className="text-cyan-400" /> CONTROLLED LONG-TERM MEMORY ({memories.length})</span><button disabled={memories.length === 0} onClick={() => void GovernedMemoryActions.clearAll()} className="cursor-pointer rounded border border-red-500/30 bg-red-950/20 px-2 py-1 text-[10px] text-red-400 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40">CLEAR ALL — L5 APPROVAL</button></div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {memories.length === 0 && <div className="p-3 text-center text-gray-500">No persistent long-term memory records.</div>}
          {memories.map((mem) => <div key={mem.id} className="flex items-center justify-between rounded border border-gray-800 bg-[#111726] p-2.5"><div className="truncate pr-4"><div className="mb-1 flex items-center gap-2"><span className="rounded border border-cyan-500/30 bg-cyan-950 px-1.5 py-0.5 text-[9px] text-cyan-300">{mem.category}</span><span className="text-[10px] text-gray-500">Confidence: {(mem.confidence * 100).toFixed(0)}%</span></div><p className="truncate text-gray-300">{mem.content}</p></div><button aria-label={`Delete memory ${mem.id}`} onClick={() => void GovernedMemoryActions.deleteMemory(mem)} className="rounded p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={13} /></button></div>)}
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-gray-800 bg-[#0d121d] p-4">
        <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-gray-300"><ShieldAlert size={14} className="text-amber-400" /> PERSISTENT SECURITY AUDIT LOG ({securityEvents.length})</span><span className="text-[9px] text-gray-500">REAL EVENTS ONLY — NO SYNTHETIC BOOT ENTRIES</span></div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {securityEvents.length === 0 && <div className="p-3 text-center text-gray-500">No persisted security events recorded yet.</div>}
          {securityEvents.map((evt) => <div key={evt.id} className="flex items-center justify-between rounded border border-gray-800 bg-[#111726] p-2.5"><div><div className="mb-1 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${evt.level === 'blocked' || evt.level === 'error' ? 'border border-red-500/30 bg-red-950 text-red-400' : evt.level === 'warning' ? 'border border-amber-500/30 bg-amber-950 text-amber-400' : 'border border-cyan-500/30 bg-cyan-950 text-cyan-300'}`}>{evt.action}</span><span className="text-[10px] text-gray-500">{new Date(evt.timestamp).toLocaleString()}</span><span className="text-[9px] text-gray-600">{evt.category}</span></div><p className="text-gray-300">{evt.details}</p></div><span className={`text-[10px] font-bold uppercase ${evt.blocked ? 'text-red-400' : 'text-gray-400'}`}>{evt.blocked ? 'BLOCKED' : 'RECORDED'}</span></div>)}
        </div>
      </div>
    </div>
  );
};
