import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowRight, Check, Library, Plus, X } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { createCreativeProjectSnapshotInput, creativeDocumentKindForAssetType, isAssetCompatibleWithDocument, sortCreativeAssetsNewestFirst } from '../../creative/CreativeProjectAssets';
import { creativeStudioForDocumentKind } from '../../creative/CreativeWorkspaceIntegration';
import type { CreativeStudioWorkspace } from '../../creative/useCreativeStudioDocument';
import { ProjectManager } from '../../project/ProjectManager';
import type { ProjectAsset } from '../../types/project';

interface Props<T> {
  workspace: Pick<CreativeStudioWorkspace<T>, 'document' | 'state' | 'setState' | 'status'>;
}

const assetLabel = (asset: ProjectAsset): string => {
  const kind = creativeDocumentKindForAssetType(asset.type);
  return kind ? creativeStudioForDocumentKind(kind)?.shortLabel ?? asset.type.toUpperCase() : asset.type.toUpperCase();
};

export const CreativeAssetLibrary = <T,>({ workspace }: Props<T>) => {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);
  const [filterCurrent, setFilterCurrent] = useState(false);

  useEffect(() => eventBus.on('PROJECT_UPDATED', () => setRevision((value) => value + 1)), []);

  const assets = useMemo(() => {
    void revision;
    const all = sortCreativeAssetsNewestFirst(ProjectManager.getProject().assets);
    return filterCurrent ? all.filter((asset) => isAssetCompatibleWithDocument(asset, workspace.document.kind)) : all;
  }, [filterCurrent, revision, workspace.document.kind]);

  const selected = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  const createSnapshot = () => {
    const asset = ProjectManager.addAsset(createCreativeProjectSnapshotInput(workspace.document, workspace.state));
    setSelectedAssetId(asset.id);
    setPendingLoadId(null);
  };

  const requestLoad = (asset: ProjectAsset) => {
    if (!isAssetCompatibleWithDocument(asset, workspace.document.kind)) return;
    setSelectedAssetId(asset.id);
    setPendingLoadId(asset.id);
  };

  const confirmLoad = () => {
    if (!selected || selected.id !== pendingLoadId || !isAssetCompatibleWithDocument(selected, workspace.document.kind)) return;
    workspace.setState(structuredClone(selected.data) as T);
    setPendingLoadId(null);
  };

  const openAssetStudio = (asset: ProjectAsset) => {
    const kind = creativeDocumentKindForAssetType(asset.type);
    if (!kind) return;
    const studio = creativeStudioForDocumentKind(kind);
    if (studio) eventBus.emit('SWITCH_MODE', studio.mode);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded border border-gray-700 bg-[#0d121d] px-2 py-1 font-bold text-gray-200 outline-none hover:border-cyan-600 hover:text-cyan-200 focus-visible:ring-1 focus-visible:ring-cyan-300"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open creative project asset library"
        title="Project creative assets"
      >
        <Library size={12} /><span className="hidden lg:inline">ASSETS</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Creative project asset library" className="absolute right-0 top-[calc(100%+0.45rem)] z-[80] w-[min(92vw,440px)] overflow-hidden rounded-xl border border-cyan-950 bg-[#080d16] text-left shadow-2xl shadow-black/70">
          <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
            <Library size={14} className="text-cyan-300" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-gray-100">PROJECT CREATIVE ASSETS</div>
              <div className="text-[9px] text-gray-500">Shared snapshots across Mio studios</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white" aria-label="Close creative asset library"><X size={14} /></button>
          </div>

          <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-2">
            <button type="button" onClick={createSnapshot} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black hover:bg-cyan-400" title="Store the current editor state as a project asset snapshot"><Plus size={12} /> SNAPSHOT</button>
            <button type="button" onClick={() => setFilterCurrent((value) => !value)} className={`rounded border px-2 py-1 ${filterCurrent ? 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200' : 'border-gray-700 text-gray-400'}`} aria-pressed={filterCurrent}>CURRENT TYPE</button>
            <span className="ml-auto text-[9px] text-gray-500">{assets.length} ASSET{assets.length === 1 ? '' : 'S'}</span>
          </div>

          <div className="grid max-h-[360px] grid-cols-[minmax(0,1fr)_minmax(150px,0.9fr)]">
            <div className="max-h-[360px] overflow-y-auto border-r border-gray-800 p-2">
              {assets.length === 0 && <div className="rounded-lg border border-dashed border-gray-800 p-4 text-center text-[10px] leading-5 text-gray-500">No creative project assets yet. Create a snapshot from any studio.</div>}
              {assets.map((asset) => {
                const active = asset.id === selectedAssetId;
                const compatible = isAssetCompatibleWithDocument(asset, workspace.document.kind);
                return (
                  <button key={asset.id} type="button" onClick={() => { setSelectedAssetId(asset.id); setPendingLoadId(null); }} className={`mb-1 w-full rounded-lg border px-2 py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${active ? 'border-cyan-500/40 bg-cyan-950/30' : 'border-gray-800 bg-[#0b111b] hover:border-gray-700'}`}>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[8px] font-bold text-cyan-300">{assetLabel(asset)}</span>
                      {compatible && <span className="text-[8px] text-emerald-400">COMPATIBLE</span>}
                    </div>
                    <div className="mt-1 truncate text-[10px] font-semibold text-gray-200" title={asset.name}>{asset.name}</div>
                    <div className="mt-0.5 text-[8px] text-gray-600">v{asset.version} · {asset.origin}</div>
                  </button>
                );
              })}
            </div>

            <div className="p-3">
              {!selected && <div className="flex h-full min-h-36 items-center justify-center text-center text-[10px] leading-5 text-gray-600">Select an asset to inspect or create a snapshot.</div>}
              {selected && (
                <div className="space-y-3">
                  <div>
                    <div className="text-[9px] font-bold text-cyan-300">{assetLabel(selected)} · V{selected.version}</div>
                    <div className="mt-1 break-words text-[11px] font-semibold text-white">{selected.name}</div>
                    <div className="mt-1 text-[9px] leading-4 text-gray-500">{selected.notes ?? selected.filePath}</div>
                  </div>

                  {isAssetCompatibleWithDocument(selected, workspace.document.kind) ? (
                    pendingLoadId === selected.id ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2">
                        <div className="text-[9px] leading-4 text-amber-200">Replace current editor state with this snapshot? The load becomes an undoable document command.</div>
                        <div className="mt-2 flex gap-1">
                          <button type="button" onClick={confirmLoad} className="flex items-center gap-1 rounded bg-amber-400 px-2 py-1 font-bold text-black"><Check size={11} /> CONFIRM</button>
                          <button type="button" onClick={() => setPendingLoadId(null)} className="rounded border border-gray-700 px-2 py-1 text-gray-300">CANCEL</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => requestLoad(selected)} className="flex w-full items-center justify-center gap-1 rounded border border-emerald-500/40 bg-emerald-950/20 px-2 py-1.5 font-bold text-emerald-300 hover:bg-emerald-900/30"><Archive size={12} /> LOAD INTO CURRENT</button>
                    )
                  ) : (
                    <button type="button" onClick={() => openAssetStudio(selected)} className="flex w-full items-center justify-center gap-1 rounded border border-violet-500/40 bg-violet-950/20 px-2 py-1.5 font-bold text-violet-300 hover:bg-violet-900/30">OPEN {assetLabel(selected)} STUDIO <ArrowRight size={11} /></button>
                  )}

                  {workspace.status === 'DIRTY' && isAssetCompatibleWithDocument(selected, workspace.document.kind) && <div className="text-[8px] leading-4 text-amber-400">Current document has unsaved changes. Loading remains undoable, but save first if you need a durable checkpoint.</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
