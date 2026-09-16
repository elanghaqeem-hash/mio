import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, BrainCircuit, RefreshCw, Rocket } from 'lucide-react';
import { systemPreferences } from '../../settings/SystemPreferences';
import { MioModelManifest } from '../../training/ModelManifest';
import {
  PromotedModelRuntimeStatus,
  promotedModelActivationService,
} from '../../training/PromotedModelActivationService';

export const PromotedModelPanel: React.FC = () => {
  const [status, setStatus] = useState<PromotedModelRuntimeStatus | null>(null);
  const [models, setModels] = useState<MioModelManifest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextStatus, promoted] = await Promise.all([
      promotedModelActivationService.status(),
      promotedModelActivationService.listPromoted(),
    ]);
    setStatus(nextStatus);
    setModels(promoted);
  }, []);

  useEffect(() => {
    void refresh();
    return systemPreferences.subscribe(() => { void refresh(); });
  }, [refresh]);

  const activate = async (manifest: MioModelManifest) => {
    setBusy(manifest.id);
    setMessage(null);
    try {
      const current = systemPreferences.getSnapshot().modelRouter;
      const result = await promotedModelActivationService.activatePromoted(manifest.id, {
        backend: current.mioLocalBackend ?? 'ollama',
        endpoint: current.mioLocalEndpoint,
      });
      setMessage(`Activated ${result.manifest.displayName} through ${result.backend}: ${result.readinessDetail}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promoted model activation failed');
    } finally {
      setBusy(null);
    }
  };

  const stateClass = status?.state === 'ACTIVE'
    ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
    : status?.state === 'CONFIGURATION_DRIFT'
      ? 'border-amber-500/40 bg-amber-950/20 text-amber-300'
      : 'border-gray-700 bg-[#111726] text-gray-300';

  return (
    <div className="bg-[#0d121d] p-4 rounded-xl border border-gray-800 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-300 font-bold flex items-center gap-2">
          <BrainCircuit size={14} className="text-cyan-400" /> MIO LOCAL MODEL LIFECYCLE
        </span>
        <button onClick={() => void refresh()} className="flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-[10px] text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300">
          <RefreshCw size={11} /> REFRESH
        </button>
      </div>

      <p className="text-gray-500 text-[10px] leading-relaxed">
        Only model manifests already promoted through MIO governance and benchmark gates can be activated here. Activation verifies that the selected local backend is actually serving the promoted runtime model before changing MIO Local settings.
      </p>

      <div className={`rounded-lg border px-3 py-2 text-[10px] ${stateClass}`}>
        <div className="flex items-center gap-2 font-bold">
          {status?.state === 'ACTIVE' ? <BadgeCheck size={13} /> : status?.state === 'CONFIGURATION_DRIFT' ? <AlertTriangle size={13} /> : <BrainCircuit size={13} />}
          {status?.state ?? 'LOADING'}
        </div>
        <div className="mt-1 opacity-90">{status?.detail ?? 'Reading promoted model registry...'}</div>
        {status?.manifest && (
          <div className="mt-1 opacity-70">Manifest: {status.manifest.id} · Runtime: {status.manifest.runtimeModel}</div>
        )}
      </div>

      {models.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-[#111726] p-3 text-[10px] text-gray-500">
          No PROMOTED model manifests are currently available. Train, benchmark, review, and promote a candidate before runtime activation.
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((manifest) => {
            const active = status?.state === 'ACTIVE' && status.manifest?.id === manifest.id;
            return (
              <div key={manifest.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-gray-800 bg-[#111726] p-3">
                <div className="min-w-0">
                  <div className="font-bold text-gray-200 truncate">{manifest.displayName}</div>
                  <div className="text-[10px] text-gray-500 mt-1 truncate">{manifest.runtimeModel} · base {manifest.baseModel} · {manifest.trainingMethod}</div>
                  <div className="text-[10px] text-gray-600 mt-1">Dataset {manifest.dataset.id} · {manifest.dataset.exampleCount} examples</div>
                </div>
                <button
                  onClick={() => void activate(manifest)}
                  disabled={busy !== null || active}
                  className={`shrink-0 flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 font-bold text-[10px] disabled:opacity-50 ${active ? 'border-emerald-500/40 text-emerald-300' : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/30'}`}
                >
                  {active ? <BadgeCheck size={12} /> : <Rocket size={12} />}
                  {active ? 'ACTIVE' : busy === manifest.id ? 'VERIFYING...' : 'ACTIVATE'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {message && <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[10px] text-cyan-200">{message}</div>}
    </div>
  );
};
