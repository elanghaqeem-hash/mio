import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Circle, FileCheck2, Pause, ShieldAlert, Square, X } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { taskRuntime } from '../../orchestrator/TaskRuntime';
import type { MioSystemMode } from '../../types/core';
import type { RuntimeTask, TaskRuntimeSnapshot, TaskRuntimeStatus, TaskStepStatus } from '../../types/tasks';

interface MissionPulseProps {
  onSelectMode: (mode: MioSystemMode) => void;
}

const ACTIVE_STATUSES = new Set<TaskRuntimeStatus>(['PENDING', 'RUNNING', 'WAITING_PERMISSION', 'PAUSED']);

const statusCopy: Record<TaskRuntimeStatus, { label: string; detail: string; tone: string }> = {
  PENDING: { label: 'QUEUED', detail: 'Menunggu giliran eksekusi yang aman.', tone: 'text-slate-300 border-slate-600/50 bg-slate-900/70' },
  RUNNING: { label: 'IN PROGRESS', detail: 'Mio sedang menjalankan langkah aktif.', tone: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/35' },
  WAITING_PERMISSION: { label: 'APPROVAL REQUIRED', detail: 'Eksekusi dijeda sampai Anda mengambil keputusan.', tone: 'text-amber-300 border-amber-500/40 bg-amber-950/30' },
  PAUSED: { label: 'PAUSED', detail: 'Misi dijeda dan tidak menjalankan langkah baru.', tone: 'text-violet-300 border-violet-500/40 bg-violet-950/30' },
  COMPLETED: { label: 'COMPLETED', detail: 'Hasil telah divalidasi dan siap ditinjau.', tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30' },
  FAILED: { label: 'FAILED SAFELY', detail: 'Misi dihentikan tanpa mengarang hasil.', tone: 'text-rose-300 border-rose-500/40 bg-rose-950/30' },
  CANCELLED: { label: 'CANCELLED', detail: 'Misi dibatalkan dan langkah aktif dihentikan.', tone: 'text-slate-400 border-slate-600/50 bg-slate-900/70' },
};

function selectMission(snapshot: TaskRuntimeSnapshot): RuntimeTask | undefined {
  return snapshot.tasks.find((task) => ACTIVE_STATUSES.has(task.status)) ?? snapshot.tasks[0];
}

function stepIcon(status: TaskStepStatus) {
  if (status === 'COMPLETED' || status === 'SKIPPED') return <Check size={12} />;
  if (status === 'RUNNING') return <span className="mission-step-pulse" aria-hidden="true" />;
  if (status === 'FAILED' || status === 'CANCELLED') return <X size={12} />;
  return <Circle size={10} />;
}

export const MissionPulse: React.FC<MissionPulseProps> = ({ onSelectMode }) => {
  const [snapshot, setSnapshot] = useState<TaskRuntimeSnapshot>(() => taskRuntime.snapshot());

  useEffect(() => eventBus.on<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', setSnapshot), []);

  const mission = useMemo(() => selectMission(snapshot), [snapshot]);

  if (!mission) {
    return (
      <section className="mission-pulse-shell" aria-label="Mission Pulse">
        <div className="mission-pulse-empty">
          <div>
            <p className="mission-pulse-kicker">MISSION PULSE // STANDBY</p>
            <p className="mt-1 text-sm text-slate-300">Belum ada misi. Mulai dari perintah teks, suara, atau salah satu command cepat.</p>
          </div>
          <button type="button" onClick={() => document.getElementById('mio-conversation')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mission-action">OPEN COMMAND INPUT <ArrowRight size={13} /></button>
        </div>
      </section>
    );
  }

  const status = statusCopy[mission.status];
  const cancellable = ACTIVE_STATUSES.has(mission.status);

  return (
    <section className="mission-pulse-shell" aria-label="Mission Pulse" aria-live="polite">
      <div className="mission-pulse-header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mission-pulse-kicker">MISSION PULSE // {mission.mode}</p>
            <span className={`mission-status-badge ${status.tone}`}>{mission.status === 'WAITING_PERMISSION' ? <ShieldAlert size={11} /> : mission.status === 'PAUSED' ? <Pause size={11} /> : mission.status === 'COMPLETED' ? <FileCheck2 size={11} /> : null}{status.label}</span>
          </div>
          <h2 className="mt-2 truncate text-base font-semibold text-white sm:text-lg" title={mission.title}>{mission.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{status.detail}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {cancellable && <button type="button" onClick={() => taskRuntime.cancel(mission.id, 'Cancelled from Mission Pulse')} className="mission-action mission-action-danger"><Square size={12} /> CANCEL</button>}
          <button type="button" onClick={() => onSelectMode(mission.status === 'COMPLETED' ? 'PROJECT' : 'TASKS')} className="mission-action">{mission.status === 'COMPLETED' ? 'VIEW ARTIFACTS' : 'MISSION CONTROL'} <ArrowRight size={13} /></button>
        </div>
      </div>

      <div className="mission-progress-track" role="progressbar" aria-label={`Progress misi ${mission.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mission.progress}>
        <span style={{ width: `${mission.progress}%` }} />
      </div>

      <ol className="mission-step-grid">
        {mission.steps.map((step, index) => (
          <li key={step.id} className={`mission-step mission-step-${step.status.toLowerCase()}`}>
            <span className="mission-step-icon">{stepIcon(step.status)}</span>
            <span className="min-w-0">
              <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">{String(index + 1).padStart(2, '0')} · {step.status.replace('_', ' ')}</span>
              <span className="mt-1 block text-[11px] leading-4 text-slate-300">{step.label}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};
