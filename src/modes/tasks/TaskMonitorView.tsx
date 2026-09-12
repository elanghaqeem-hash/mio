import React, { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { emergencyStop } from '../../core/EmergencyStop';
import { taskRuntime } from '../../orchestrator/TaskRuntime';
import type { RuntimeTask, TaskRuntimeSnapshot } from '../../types/tasks';

const statusTone: Record<RuntimeTask['status'], string> = {
  PENDING: 'text-gray-300 border-gray-700 bg-gray-900/50',
  RUNNING: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/30',
  WAITING_PERMISSION: 'text-amber-300 border-amber-500/40 bg-amber-950/20',
  PAUSED: 'text-violet-300 border-violet-500/40 bg-violet-950/20',
  COMPLETED: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/20',
  FAILED: 'text-red-300 border-red-500/40 bg-red-950/20',
  CANCELLED: 'text-gray-400 border-gray-700 bg-gray-900/40',
};

export const TaskMonitorView: React.FC = () => {
  const [snapshot, setSnapshot] = useState<TaskRuntimeSnapshot>(() => taskRuntime.snapshot());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => eventBus.on<TaskRuntimeSnapshot>('TASK_RUNTIME_SNAPSHOT', setSnapshot), []);

  const selectedTask = useMemo(
    () => snapshot.tasks.find((task) => task.id === selectedTaskId) ?? snapshot.tasks[0] ?? null,
    [snapshot.tasks, selectedTaskId]
  );

  const activeCount = snapshot.tasks.filter((task) => ['PENDING', 'RUNNING', 'WAITING_PERMISSION', 'PAUSED'].includes(task.status)).length;
  const failedCount = snapshot.tasks.filter((task) => task.status === 'FAILED').length;

  return (
    <div className="h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-800 bg-[#0d121d] flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-cyan-300 tracking-wide">TASK RUNTIME // OBSERVABILITY</div>
          <div className="text-[10px] text-gray-500 mt-1">Live lifecycle, progress, permission waits, bounded retry scheduling, cancellation, and STOP MIO propagation.</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded border border-cyan-500/30 text-cyan-300 bg-cyan-950/20">ACTIVE {activeCount}</span>
          <span className="px-2 py-1 rounded border border-red-500/30 text-red-300 bg-red-950/20">FAILED {failedCount}</span>
          <button onClick={() => taskRuntime.clearCompleted()} className="flex items-center gap-1 px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500">
            <Trash2 size={12} /> Clear terminal
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[42%] border-r border-gray-800 overflow-y-auto p-3 space-y-2">
          {snapshot.tasks.length === 0 && <div className="h-full flex items-center justify-center text-center text-gray-600 px-8">No runtime tasks yet. Send a directive in Chat, Research, or Project mode to create one.</div>}
          {snapshot.tasks.map((task) => (
            <button key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`w-full text-left p-3 rounded-xl border transition ${selectedTask?.id === task.id ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-gray-800 bg-[#0d121d] hover:border-gray-700'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-gray-200 font-bold truncate">{task.title}</div><div className="text-[10px] text-gray-500 mt-1">{task.mode} • {task.id}</div></div>
                <span className={`shrink-0 px-2 py-0.5 rounded border text-[9px] ${statusTone[task.status]}`}>{task.status}</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${task.progress}%` }} /></div>
              <div className="mt-1 flex justify-between text-[9px] text-gray-500"><span>{task.progress}%</span><span>retry {task.retryCount}/{task.maxRetries}</span></div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedTask ? <div className="h-full flex items-center justify-center text-gray-600">Select a task to inspect runtime details.</div> : (
            <div className="space-y-4 max-w-4xl">
              <div className="p-4 rounded-xl border border-gray-800 bg-[#0d121d]">
                <div className="flex items-start justify-between gap-4">
                  <div><div className="text-base font-bold text-white">{selectedTask.title}</div><div className="text-[10px] text-gray-500 mt-1">Project: {selectedTask.projectId ?? 'workspace'} • Mode: {selectedTask.mode}</div></div>
                  <span className={`px-2 py-1 rounded border ${statusTone[selectedTask.status]}`}>{selectedTask.status}</span>
                </div>
                <div className="mt-3 text-gray-400 leading-relaxed break-words">{selectedTask.prompt}</div>
                {selectedTask.error && <div className="mt-3 p-2 rounded border border-red-500/30 bg-red-950/20 text-red-300">{selectedTask.error}</div>}
                {selectedTask.cancellationReason && <div className="mt-3 p-2 rounded border border-gray-700 bg-gray-900/40 text-gray-400">Cancelled: {selectedTask.cancellationReason}</div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedTask.status === 'RUNNING' && <button title="Cooperative pause: prevents the runtime from advancing at supported step boundaries. Use Cancel or STOP MIO to abort an in-flight network/model operation." onClick={() => taskRuntime.pause(selectedTask.id)} className="flex items-center gap-1 px-3 py-1.5 rounded border border-violet-500/40 text-violet-300 hover:bg-violet-950/30"><Pause size={13} /> Pause at step boundary</button>}
                  {selectedTask.status === 'PAUSED' && <button onClick={() => taskRuntime.resume(selectedTask.id)} className="flex items-center gap-1 px-3 py-1.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/30"><Play size={13} /> Resume</button>}
                  {selectedTask.status === 'FAILED' && selectedTask.retryCount < selectedTask.maxRetries && <button title="Returns the failed task to PENDING within its retry budget. Automatic queue re-execution is handled by the next scheduler milestone." onClick={() => taskRuntime.scheduleRetry(selectedTask.id)} className="flex items-center gap-1 px-3 py-1.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-950/30"><RotateCcw size={13} /> Schedule retry</button>}
                  {!['COMPLETED', 'FAILED', 'CANCELLED'].includes(selectedTask.status) && <button onClick={() => taskRuntime.cancel(selectedTask.id, 'Cancelled from Task Monitor')} className="flex items-center gap-1 px-3 py-1.5 rounded border border-red-500/40 text-red-300 hover:bg-red-950/30"><Square size={13} /> Cancel & abort</button>}
                  <button onClick={() => emergencyStop.triggerEmergencyStop('STOP MIO from Task Monitor')} className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-bold"><Square size={13} /> STOP MIO</button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-gray-800 bg-[#0d121d]">
                <div className="text-cyan-300 font-bold mb-3">EXECUTION STEPS</div>
                <div className="space-y-2">
                  {selectedTask.steps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-[#111726]">
                      <div className="w-6 h-6 rounded-full border border-gray-700 flex items-center justify-center text-[10px] text-gray-400">{index + 1}</div>
                      <div className="flex-1 min-w-0"><div className="text-gray-200">{step.label}</div><div className="text-[9px] text-gray-500 mt-1">{step.mode}{step.requiresPermission ? ' • permission-gated' : ''}</div>{step.error && <div className="text-[10px] text-red-300 mt-1">{step.error}</div>}</div>
                      <span className="text-[9px] px-2 py-0.5 rounded border border-gray-700 text-gray-400">{step.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-gray-800 bg-[#0d121d]"><div className="text-[9px] text-gray-500">DEPENDENCIES</div><div className="text-gray-200 mt-1">{selectedTask.dependencies.length ? selectedTask.dependencies.join(', ') : 'None'}</div></div>
                <div className="p-3 rounded-xl border border-gray-800 bg-[#0d121d]"><div className="text-[9px] text-gray-500">UPDATED</div><div className="text-gray-200 mt-1">{new Date(selectedTask.updatedAt).toLocaleTimeString()}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
