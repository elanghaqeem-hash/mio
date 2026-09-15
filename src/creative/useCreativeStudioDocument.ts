import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { CreativeCommand, CreativeDocument } from '../types/creativeDocument';
import { createCreativeWorkspaceId, migrateLegacyCreativeDocument } from './CreativeDocumentFactory';
import { CreativeDocumentKernel } from './CreativeDocumentKernel';
import { CreativeAutosaveController, CreativeDocumentRepository } from './CreativeDocumentRepository';

export type CreativeWorkspaceStatus = 'LOADING' | 'READY' | 'DIRTY' | 'SAVED' | 'RECOVERED' | 'ERROR';

export interface CreativeStudioWorkspace<T> {
  document: CreativeDocument;
  state: T;
  setState: Dispatch<SetStateAction<T>>;
  status: CreativeWorkspaceStatus;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
}

class CreativeStudioRuntime<T> {
  public readonly workspaceId: string;
  public readonly repository: CreativeDocumentRepository;
  public readonly autosave: CreativeAutosaveController;
  private kernelValue: CreativeDocumentKernel;
  private stateValue: T;

  public constructor(fileName: string, initialState: T) {
    this.workspaceId = createCreativeWorkspaceId(fileName);
    const initialDocument = migrateLegacyCreativeDocument(fileName, initialState, 0, this.workspaceId);
    this.repository = new CreativeDocumentRepository(defaultStorageProvider);
    this.autosave = new CreativeAutosaveController(this.repository);
    this.kernelValue = new CreativeDocumentKernel(initialDocument);
    this.stateValue = structuredClone(initialState);
  }

  public get kernel(): CreativeDocumentKernel { return this.kernelValue; }
  public get state(): T { return this.stateValue; }
  public replaceKernel(document: CreativeDocument): void { this.kernelValue = new CreativeDocumentKernel(document); }
  public replaceState(state: T): void { this.stateValue = state; }
}

const readLegacyState = <T>(document: CreativeDocument, fallback: T): T => {
  const value = document.metadata.legacyData;
  return value && typeof value === 'object' ? structuredClone(value) as T : fallback;
};

export const createStudioStateCommand = <T>(document: CreativeDocument, fileName: string, state: T): CreativeCommand => {
  const projected = migrateLegacyCreativeDocument(fileName, state, document.updatedAt, document.id);
  const recordedManagedIds = Array.isArray(document.metadata.legacyManagedNodeIds)
    ? document.metadata.legacyManagedNodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string')
    : document.rootNodeIds;
  const deletes: CreativeCommand[] = recordedManagedIds.filter((nodeId) => Boolean(document.nodes[nodeId])).map((nodeId) => ({ type: 'node.delete', nodeId }));
  const creates: CreativeCommand[] = projected.rootNodeIds.map((nodeId) => ({ type: 'node.create', node: projected.nodes[nodeId] }));
  const selectedNodeId = projected.rootNodeIds[0] ?? null;
  return {
    type: 'batch',
    commands: [
      ...deletes,
      ...creates,
      {
        type: 'document.update',
        changes: {
          metadata: { ...document.metadata, legacyManagedNodeIds: [...projected.rootNodeIds], legacyData: structuredClone(state) },
          ...(projected.timeline ? { timeline: projected.timeline } : {}),
        },
      },
      { type: 'selection.set', nodeIds: selectedNodeId ? [selectedNodeId] : [], primaryNodeId: selectedNodeId },
    ],
  };
};

export const useCreativeStudioDocument = <T,>(fileName: string, initialState: T): CreativeStudioWorkspace<T> => {
  const [runtime] = useState(() => new CreativeStudioRuntime(fileName, initialState));
  const [document, setDocument] = useState(() => runtime.kernel.snapshot());
  const [state, setReactState] = useState<T>(() => runtime.state);
  const [status, setStatus] = useState<CreativeWorkspaceStatus>('LOADING');
  const [error, setError] = useState<string | null>(null);

  const syncSnapshot = useCallback((snapshot: CreativeDocument, fallback: T, nextStatus: CreativeWorkspaceStatus) => {
    const legacyState = readLegacyState(snapshot, fallback);
    runtime.replaceState(legacyState);
    setReactState(legacyState);
    setDocument(snapshot);
    setStatus(nextStatus);
    setError(null);
  }, [runtime]);

  useEffect(() => {
    let active = true;
    const open = async (): Promise<void> => {
      try {
        const durable = await runtime.repository.load(runtime.workspaceId);
        const recovery = await runtime.repository.loadRecovery(runtime.workspaceId);
        const recovered = recovery && (!durable || recovery.savedAt > durable.updatedAt) ? recovery.document : null;
        const opened = recovered ?? durable ?? migrateLegacyCreativeDocument(fileName, initialState, Date.now(), runtime.workspaceId);
        if (!durable && !recovered) await runtime.repository.save(opened);
        if (!active) return;
        runtime.replaceKernel(opened);
        syncSnapshot(runtime.kernel.snapshot(), initialState, recovered ? 'RECOVERED' : 'READY');
      } catch (reason) {
        if (!active) return;
        setStatus('ERROR');
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void open();
    return () => { active = false; runtime.autosave.cancel(); };
  }, [fileName, initialState, runtime, syncSnapshot]);

  const setState: Dispatch<SetStateAction<T>> = useCallback((update) => {
    try {
      const next = typeof update === 'function' ? (update as (previous: T) => T)(runtime.state) : update;
      const current = runtime.kernel.snapshot();
      const snapshot = runtime.kernel.execute({ actor: 'user', command: createStudioStateCommand(current, fileName, next) });
      syncSnapshot(snapshot, next, 'DIRTY');
      runtime.autosave.schedule(snapshot);
    } catch (reason) {
      setStatus('ERROR');
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [fileName, runtime, syncSnapshot]);

  const undo = useCallback(() => {
    const snapshot = runtime.kernel.undo('user');
    syncSnapshot(snapshot, runtime.state, 'DIRTY');
    runtime.autosave.schedule(snapshot);
  }, [runtime, syncSnapshot]);

  const redo = useCallback(() => {
    const snapshot = runtime.kernel.redo('user');
    syncSnapshot(snapshot, runtime.state, 'DIRTY');
    runtime.autosave.schedule(snapshot);
  }, [runtime, syncSnapshot]);

  const save = useCallback(async () => {
    try {
      await runtime.autosave.flush(runtime.kernel.snapshot());
      setStatus('SAVED');
      setError(null);
    } catch (reason) {
      setStatus('ERROR');
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [runtime]);

  return { document, state, setState, status, error, canUndo: runtime.kernel.canUndo(), canRedo: runtime.kernel.canRedo(), undo, redo, save };
};
