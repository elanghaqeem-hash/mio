import {
  AdapterIntegrityHashOutput,
  createDesktopAdapterIntegrityGateway,
  getRequiredDesktopAdapterIntegrityBridge,
} from '../platform/desktop/DesktopAdapterIntegrityGateway';
import {
  authorizeDesktopWorkspace,
  getRequiredDesktopBridge,
  revokeDesktopWorkspace,
} from '../platform/desktop/DesktopWorkspaceGateway';
import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { ModelManifestRepository } from './ModelManifestRepository';
import { TrainingCandidateRegistry } from './TrainingCandidateRegistry';

const NAMESPACE = 'training' as const;
const INDEX_KEY = 'candidate-adapter-integrity-index-v1';

export type AdapterIntegrityComparison = 'BASELINE_CAPTURED' | 'MATCH' | 'DRIFT';

export interface CandidateAdapterIntegrityEvidence {
  schemaVersion: 1;
  id: string;
  candidateId: string;
  manifestId: string;
  runtimeModel: string;
  artifactUri: string;
  trainingResultFingerprint: string;
  algorithm: 'SHA-256';
  canonicalization: 'mio-adapter-tree-v1';
  fingerprint: string;
  fileCount: number;
  totalBytes: number;
  rootRelativePath: string;
  scannedAt: number;
  comparison: AdapterIntegrityComparison;
  previousFingerprint?: string;
  limits: { maxFiles: number; maxBytes: number; maxDepth: number };
  disclosure: string;
}

export interface CandidateIntegrityScanResult {
  cancelled: boolean;
  workspaceLabel?: string;
  evidence?: CandidateAdapterIntegrityEvidence;
}

export interface CandidateIntegrityDesktopPort {
  authorizeDirectory(): Promise<{ id: string; name: string } | null>;
  hashDirectory(workspaceId: string, relativePath: string, taskId: string): Promise<AdapterIntegrityHashOutput>;
  revokeDirectory(workspaceId: string): Promise<void>;
}

function defaultDesktopPort(): CandidateIntegrityDesktopPort {
  const workspaceBridge = getRequiredDesktopBridge();
  const integrityBridge = getRequiredDesktopAdapterIntegrityBridge();
  const gateway = createDesktopAdapterIntegrityGateway(integrityBridge);
  return {
    authorizeDirectory: () => authorizeDesktopWorkspace(workspaceBridge),
    async hashDirectory(workspaceId, relativePath, taskId) {
      const result = await gateway.execute<AdapterIntegrityHashOutput>(
        'service.desktop.workspace.hash-tree',
        { workspaceId, relativePath },
        {
          taskId,
          mode: 'SETTINGS',
          requestedBy: 'USER',
          resourceId: workspaceId,
          path: relativePath,
        },
      );
      if (!result.success || !result.data) throw new Error(result.error ?? 'Governed adapter-integrity scan failed');
      return result.data;
    },
    async revokeDirectory(workspaceId) {
      await revokeDesktopWorkspace(workspaceId, workspaceBridge);
    },
  };
}

export class TrainingCandidateIntegrityService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly manifests: ModelManifestRepository;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
  }

  public async scanCandidate(candidateId: string, desktopPort?: CandidateIntegrityDesktopPort): Promise<CandidateIntegrityScanResult> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);

    const port = desktopPort ?? defaultDesktopPort();
    const workspace = await port.authorizeDirectory();
    if (!workspace) return { cancelled: true };

    try {
      const taskId = `adapter_integrity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const hash = await port.hashDirectory(workspace.id, '.', taskId);
      const previous = await this.latest(candidateId);
      const comparison: AdapterIntegrityComparison = !previous
        ? 'BASELINE_CAPTURED'
        : previous.fingerprint === hash.fingerprint
          ? 'MATCH'
          : 'DRIFT';
      const scannedAt = Date.now();
      const evidence: CandidateAdapterIntegrityEvidence = {
        schemaVersion: 1,
        id: `adapter-integrity:${candidateId}:${scannedAt}`,
        candidateId,
        manifestId: candidate.manifestId,
        runtimeModel: manifest.runtimeModel,
        artifactUri: candidate.artifactUri,
        trainingResultFingerprint: candidate.trainingResultFingerprint,
        algorithm: hash.algorithm,
        canonicalization: hash.canonicalization,
        fingerprint: hash.fingerprint,
        fileCount: hash.fileCount,
        totalBytes: hash.totalBytes,
        rootRelativePath: hash.rootRelativePath,
        scannedAt,
        comparison,
        ...(previous ? { previousFingerprint: previous.fingerprint } : {}),
        limits: { ...hash.limits },
        disclosure: 'Byte-level SHA-256 evidence for the explicitly authorized local directory. This evidence does not prove model quality, does not identify remote artifacts, and does not promote or activate the candidate.',
      };
      await this.save(evidence);
      return { cancelled: false, workspaceLabel: workspace.name, evidence };
    } finally {
      try { await port.revokeDirectory(workspace.id); } catch { /* Revocation failure must not erase completed integrity evidence. */ }
    }
  }

  public async latest(candidateId: string): Promise<CandidateAdapterIntegrityEvidence | undefined> {
    const history = await this.list(candidateId, 1);
    return history[0];
  }

  public async list(candidateId: string, limit = 20): Promise<CandidateAdapterIntegrityEvidence[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const output: CandidateAdapterIntegrityEvidence[] = [];
    for (const id of index) {
      const item = await this.storage.get<CandidateAdapterIntegrityEvidence>(NAMESPACE, id);
      if (item?.candidateId === candidateId) output.push(structuredClone(item));
      if (output.length >= Math.max(1, Math.min(limit, 100))) break;
    }
    return output;
  }

  private async save(evidence: CandidateAdapterIntegrityEvidence): Promise<void> {
    await this.storage.set(NAMESPACE, evidence.id, structuredClone(evidence));
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, INDEX_KEY, [evidence.id, ...index.filter((id) => id !== evidence.id)].slice(0, 2_000));
  }
}

export const trainingCandidateIntegrityService = new TrainingCandidateIntegrityService();
