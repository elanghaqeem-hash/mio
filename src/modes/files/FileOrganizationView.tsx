import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronLeft, FileText, Folder, FolderOpen, LockKeyhole, RefreshCw, ShieldCheck, Unplug, Search, Network, Sparkles, History, ScanSearch } from 'lucide-react';
import { ProjectManager } from '../../project/ProjectManager';
import {
  authorizeDesktopWorkspace,
  createDesktopWorkspaceGateway,
  getDesktopWorkspaceBridge,
  revokeDesktopWorkspace,
  type DesktopWorkspaceDescriptor,
  type DesktopWorkspaceEntry,
} from '../../platform/desktop/DesktopWorkspaceGateway';
import { KnowledgeIngestionService } from '../../services/KnowledgeIngestionService';

interface PreviewState {
  path: string;
  text: string;
  bytes: number;
  suspicious?: boolean;
  memoryStatus?: string;
}

let requestSequence = 0;
const createRequestTaskId = (prefix: string) => {
  requestSequence += 1;
  return `${prefix}_${requestSequence}`;
};
const normalizeChildPath = (parent: string, child: string) => parent === '.' ? child : `${parent}/${child}`;
const parentPath = (current: string) => {
  if (current === '.') return '.';
  const segments = current.split('/').filter(Boolean);
  segments.pop();
  return segments.length ? segments.join('/') : '.';
};

export const FileOrganizationView: React.FC = () => {
  const bridge = useMemo(() => getDesktopWorkspaceBridge(), []);
  const gateway = useMemo(() => bridge ? createDesktopWorkspaceGateway(bridge) : undefined, [bridge]);
  const [workspace, setWorkspace] = useState<DesktopWorkspaceDescriptor | null>(null);
  const [currentPath, setCurrentPath] = useState('.');
  const [entries, setEntries] = useState<DesktopWorkspaceEntry[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<DesktopWorkspaceEntry | null>(null);
  const [status, setStatus] = useState(bridge ? 'No workspace authorized.' : 'Desktop workspace bridge unavailable in this runtime.');
  const [busy, setBusy] = useState(false);
  const [activePanel, setActivePanel] = useState<'BROWSE'|'SEARCH'|'RELATIONSHIPS'|'ORGANIZE'|'RECOVERY'>('BROWSE');
  const fileCount = entries.filter((entry) => entry.type === 'FILE').length;
  const directoryCount = entries.filter((entry) => entry.type === 'DIRECTORY').length;

  const executeList = useCallback(async (authorizedWorkspace: DesktopWorkspaceDescriptor, relativePath: string) => {
    if (!gateway) return;
    setBusy(true);
    try {
      const project = ProjectManager.getProject();
      const result = await gateway.execute<{ entries: DesktopWorkspaceEntry[] }>(
        'service.desktop.workspace.list',
        { workspaceId: authorizedWorkspace.id, relativePath },
        {
          taskId: createRequestTaskId('files_list'),
          projectId: project.id,
          mode: 'FILES',
          requestedBy: 'USER',
          resourceId: authorizedWorkspace.id,
          path: relativePath,
        },
      );
      if (!result.success || !result.data) throw new Error(result.error ?? 'Workspace listing failed');
      setEntries(result.data.entries);
      setCurrentPath(relativePath);
      setPreview(null);
      setSelectedEntry(null);
      setStatus(`Read-only directory loaded: ${relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [gateway]);

  const handleAuthorize = async () => {
    if (!bridge || !gateway) return;
    setBusy(true);
    try {
      const authorized = await authorizeDesktopWorkspace(bridge);
      if (!authorized) {
        setStatus('Workspace selection cancelled.');
        return;
      }
      setWorkspace(authorized);
      await executeList(authorized, '.');
      setStatus(`Workspace authorized for this session: ${authorized.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!workspace || !bridge) return;
    try {
      await revokeDesktopWorkspace(workspace.id, bridge);
    } finally {
      setWorkspace(null);
      setEntries([]);
      setPreview(null);
      setSelectedEntry(null);
      setCurrentPath('.');
      setStatus('Workspace authority revoked. Re-authorization is required before further access.');
    }
  };

  const handleEntry = async (entry: DesktopWorkspaceEntry) => {
    if (!workspace || !gateway) return;
    const relativePath = normalizeChildPath(currentPath, entry.name);
    setSelectedEntry(entry);
    if (entry.type === 'DIRECTORY') {
      await executeList(workspace, relativePath);
      return;
    }
    if (entry.type !== 'FILE') {
      setStatus('Symlinks and non-file entries are not opened by the read-only browser.');
      return;
    }
    if (!KnowledgeIngestionService.isSupportedTextPath(relativePath)) {
      setPreview(null);
      setStatus('Preview is limited to explicitly supported text formats. Binary/office/media files are not parsed in this milestone.');
      return;
    }

    setBusy(true);
    try {
      const project = ProjectManager.getProject();
      const result = await gateway.execute<{ text: string; bytes: number }>(
        'service.desktop.workspace.read-text',
        { workspaceId: workspace.id, relativePath },
        {
          taskId: createRequestTaskId('files_read'),
          projectId: project.id,
          mode: 'FILES',
          requestedBy: 'USER',
          resourceId: workspace.id,
          path: relativePath,
        },
      );
      if (!result.success || !result.data) throw new Error(result.error ?? 'File preview failed');
      setPreview({ path: relativePath, text: result.data.text, bytes: result.data.bytes });
      setStatus(`Read-only preview loaded: ${relativePath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleIngest = () => {
    if (!workspace || !preview) return;
    try {
      const result = KnowledgeIngestionService.ingestDocument({
        workspaceId: workspace.id,
        relativePath: preview.path,
        content: preview.text,
        bytes: preview.bytes,
      });
      setPreview((current) => current ? {
        ...current,
        suspicious: result.suspicious,
        memoryStatus: result.memory.status,
      } : current);
      setStatus(result.memory.status === 'REVIEW_REQUIRED'
        ? 'Added to project context as quarantined document. Long-term memory remains pending explicit review.'
        : `Project context ingestion completed; memory status: ${result.memory.status}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  if (!bridge) {
    return (
      <div className="h-full w-full bg-[#07090e] p-6 font-mono text-xs text-gray-300">
        <div className="max-w-3xl rounded-2xl border border-gray-800 bg-[#0d121d] p-6">
          <div className="mb-3 flex items-center gap-2 text-cyan-300"><Unplug size={18} /><span className="font-bold">DESKTOP WORKSPACE BRIDGE UNAVAILABLE</span></div>
          <p className="leading-6 text-gray-400">This web runtime does not expose native filesystem authority. No desktop access is simulated. Use the Electron desktop runtime to authorize a local workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#07090e] p-4 font-mono text-xs text-gray-300">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300"><FolderOpen size={16} /><span className="font-bold text-sm">MIO FILE INTELLIGENCE</span></div>
          <div className="mt-1 text-[10px] text-gray-500">Scan · inspect · search · organize · approval-gated mutation · recovery audit</div>
        </div>
        <div className="flex gap-2">
          {workspace ? (
            <button onClick={handleRevoke} className="flex items-center gap-1.5 rounded bg-gray-800 px-3 py-1.5 text-gray-300 hover:bg-gray-700"><LockKeyhole size={13} /> Revoke</button>
          ) : (
            <button disabled={busy} onClick={handleAuthorize} className="flex items-center gap-1.5 rounded bg-cyan-500 px-4 py-1.5 font-bold text-black hover:bg-cyan-400 disabled:opacity-50"><ShieldCheck size={14} /> Authorize Workspace</button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {([
          ['BROWSE','Browse',ScanSearch],['SEARCH','Smart Search',Search],['RELATIONSHIPS','Relationships',Network],['ORGANIZE','Organize',Sparkles],['RECOVERY','Recovery',History],
        ] as const).map(([id,label,Icon]) => <button key={id} onClick={()=>setActivePanel(id)} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${activePanel===id?'border-cyan-500/60 bg-cyan-500/10 text-cyan-300':'border-gray-800 bg-[#0d121d] text-gray-500 hover:text-gray-300'}`}><Icon size={13}/>{label}</button>)}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-gray-800 bg-[#0d121d] p-3"><div className="text-[9px] uppercase text-gray-600">Files visible</div><div className="mt-1 text-lg text-gray-200">{fileCount}</div></div>
        <div className="rounded-lg border border-gray-800 bg-[#0d121d] p-3"><div className="text-[9px] uppercase text-gray-600">Folders visible</div><div className="mt-1 text-lg text-gray-200">{directoryCount}</div></div>
        <div className="rounded-lg border border-gray-800 bg-[#0d121d] p-3"><div className="text-[9px] uppercase text-gray-600">Authority</div><div className="mt-1 text-xs text-gray-200">{workspace?'AUTHORIZED':'LOCKED'}</div></div>
        <div className="rounded-lg border border-gray-800 bg-[#0d121d] p-3"><div className="text-[9px] uppercase text-gray-600">Mutation</div><div className="mt-1 text-xs text-amber-300">APPROVAL REQUIRED</div></div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
        <div className="col-span-7 flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#0d121d]">
          <div className="flex items-center justify-between border-b border-gray-800 bg-[#111726] p-3">
            <div className="flex items-center gap-2">
              <Folder size={14} className="text-cyan-400" />
              <span className="text-gray-300">{workspace ? `${workspace.name} / ${currentPath}` : 'No authorized workspace'}</span>
            </div>
            <div className="flex gap-2">
              <button disabled={!workspace || currentPath === '.' || busy} onClick={() => workspace && executeList(workspace, parentPath(currentPath))} className="rounded bg-gray-800 p-1.5 disabled:opacity-30"><ChevronLeft size={13} /></button>
              <button disabled={!workspace || busy} onClick={() => workspace && executeList(workspace, currentPath)} className="rounded bg-gray-800 p-1.5 disabled:opacity-30"><RefreshCw size={13} /></button>
            </div>
          </div>
          <div className="border-b border-gray-800 px-3 py-2 text-[10px] text-gray-500">{busy ? `Scanning current directory…` : workspace ? `${entries.length} entries loaded · bounded listing` : `Scanner idle · authorize a workspace to begin`}</div>
          <div className="flex-1 overflow-y-auto">
            {!workspace && <div className="p-6 text-gray-500">Authorize a folder using the native desktop picker. The absolute root remains inside Electron main-process authority.</div>}
            {workspace && entries.length === 0 && !busy && <div className="p-6 text-gray-500">No entries in this directory.</div>}
            {entries.map((entry) => (
              <button key={`${currentPath}/${entry.name}`} onClick={() => void handleEntry(entry)} className="grid w-full grid-cols-12 items-center border-b border-gray-800/60 p-3 text-left hover:bg-gray-800/30">
                <div className="col-span-8 flex items-center gap-2 truncate">
                  {entry.type === 'DIRECTORY' ? <Folder size={14} className="text-cyan-400" /> : <FileText size={14} className="text-gray-400" />}
                  <span className="truncate">{entry.name}</span>
                </div>
                <div className="col-span-4 text-right text-[10px] text-gray-500">{entry.type}{entry.bytes !== undefined ? ` · ${entry.bytes.toLocaleString()} B` : ``}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-5 flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#0d121d]">
          <div className="border-b border-gray-800 bg-[#111726] p-3 font-bold text-gray-400">INTELLIGENCE INSPECTOR</div>
          {selectedEntry && <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-gray-800 p-3 text-[10px]">
            <div><span className="text-gray-600">TYPE</span><div className="mt-1 text-gray-300">{selectedEntry.type}</div></div>
            <div><span className="text-gray-600">SIZE</span><div className="mt-1 text-gray-300">{selectedEntry.bytes === undefined ? '—' : `${selectedEntry.bytes.toLocaleString()} B`}</div></div>
            <div><span className="text-gray-600">MODIFIED</span><div className="mt-1 text-gray-300">{selectedEntry.modifiedAtMs ? new Date(selectedEntry.modifiedAtMs).toLocaleString() : '—'}</div></div>
            <div><span className="text-gray-600">INTELLIGENCE</span><div className="mt-1 text-amber-300">NOT ANALYZED</div></div>
          </div>}
          {preview ? (
            <>
              <div className="border-b border-gray-800 p-3">
                <div className="truncate text-cyan-300">{preview.path}</div>
                <div className="mt-1 text-[10px] text-gray-500">{preview.bytes} bytes · untrusted document content</div>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-5 text-gray-300">{preview.text}</pre>
              <div className="border-t border-gray-800 p-3">
                {preview.suspicious && <div className="mb-2 flex items-center gap-1.5 text-amber-400"><AlertTriangle size={13} /> Suspicious instruction-like content detected and quarantined.</div>}
                <button onClick={handleIngest} className="flex w-full items-center justify-center gap-2 rounded bg-cyan-500 px-3 py-2 font-bold text-black hover:bg-cyan-400"><BookOpen size={14} /> Add to Project Context</button>
                <div className="mt-2 text-[10px] leading-4 text-gray-500">Content is sanitized and stored as an unverified imported project document. Any long-term memory promotion remains review-gated.</div>
              </div>
            </>
          ) : (
            <div className="p-6 text-gray-500">Select a supported text file to preview it. Unsupported binary, Office, PDF, image, audio, and video files are not falsely parsed.</div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-800 bg-[#0a0e17] px-3 py-2 text-[10px] text-gray-400">
        <span className="mr-2 text-cyan-500">STATUS</span>{busy ? 'Processing bounded workspace request…' : status}
      </div>
    </div>
  );
};
