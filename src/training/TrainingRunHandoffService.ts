import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { TrainingCandidateRecord } from './TrainingCandidateRegistry';
import { TrainingCandidateRegistry } from './TrainingCandidateRegistry';
import {
  verifyTrainingRunHandoff,
  type TrainingRunHandoffVerification,
} from './TrainingRunHandoff';

const NAMESPACE = 'training' as const;
const RECEIPT_INDEX_KEY = 'training-run-handoff-receipt-index-v1';

export interface TrainingRunHandoffReceipt {
  schemaVersion: 1;
  id: string;
  candidateId: string;
  manifestId: string;
  kind: 'MIO_TRAINING_RUN_HANDOFF_V1';
  handoffSha256: string;
  trainingResultSha256: string;
  bundleId: string;
  datasetSha256: string;
  configSha256: string;
  handoffCreatedAt: number;
  registeredAt: number;
  disclosure: string;
}

export interface RegisterTrainingRunHandoffInput {
  handoffJson: string;
  runtimeModel: string;
  artifactUri: string;
  displayName?: string;
}

export interface RegisterTrainingRunHandoffResult {
  candidate: TrainingCandidateRecord;
  verification: TrainingRunHandoffVerification;
  receipt: TrainingRunHandoffReceipt;
}

export class TrainingRunHandoffService {
  private readonly candidates: TrainingCandidateRegistry;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
  }

  public async verify(handoffJson: string): Promise<TrainingRunHandoffVerification> {
    return verifyTrainingRunHandoff(handoffJson);
  }

  public async register(input: RegisterTrainingRunHandoffInput): Promise<RegisterTrainingRunHandoffResult> {
    const verification = await this.verify(input.handoffJson);
    if (!verification.valid
      || !verification.bundle
      || !verification.result
      || !verification.handoffSha256
      || !verification.trainingResultSha256
      || !verification.handoffCreatedAt) {
      throw new Error(`Training run handoff registration blocked: ${verification.errors.join('; ') || 'handoff verification failed'}`);
    }
    const registered = await this.candidates.register({
      bundle: verification.bundle.manifest,
      result: verification.result,
      runtimeModel: input.runtimeModel,
      artifactUri: input.artifactUri,
      displayName: input.displayName,
    });

    const receipt: TrainingRunHandoffReceipt = {
      schemaVersion: 1,
      id: this.receiptKey(registered.candidate.id),
      candidateId: registered.candidate.id,
      manifestId: registered.candidate.manifestId,
      kind: 'MIO_TRAINING_RUN_HANDOFF_V1',
      handoffSha256: verification.handoffSha256,
      trainingResultSha256: verification.trainingResultSha256,
      bundleId: verification.bundle.manifest.bundleId,
      datasetSha256: verification.bundle.manifest.dataset.sha256,
      configSha256: verification.bundle.manifest.reproducibility.configSha256,
      handoffCreatedAt: verification.handoffCreatedAt,
      registeredAt: Date.now(),
      disclosure: 'Verified TP-0.58 handoff receipt. This receipt binds training bundle/result identity to the candidate registration but does not prove adapter bytes, benchmark success, promotion readiness, or activation safety.',
    };
    await this.saveReceipt(receipt);
    return { candidate: registered.candidate, verification, receipt };
  }

  public async getReceipt(candidateId: string): Promise<TrainingRunHandoffReceipt | undefined> {
    const value = await this.storage.get<TrainingRunHandoffReceipt>(NAMESPACE, this.receiptKey(candidateId));
    return value ? structuredClone(value) : undefined;
  }

  public async listReceipts(limit = 100): Promise<TrainingRunHandoffReceipt[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, RECEIPT_INDEX_KEY) ?? [];
    const output: TrainingRunHandoffReceipt[] = [];
    for (const id of index.slice(0, Math.max(1, Math.min(limit, 500)))) {
      const item = await this.storage.get<TrainingRunHandoffReceipt>(NAMESPACE, id);
      if (item) output.push(structuredClone(item));
    }
    return output;
  }

  private async saveReceipt(receipt: TrainingRunHandoffReceipt): Promise<void> {
    const existing = await this.storage.get<TrainingRunHandoffReceipt>(NAMESPACE, receipt.id);
    if (existing) {
      const immutableFieldsMatch = existing.candidateId === receipt.candidateId
        && existing.manifestId === receipt.manifestId
        && existing.handoffSha256 === receipt.handoffSha256
        && existing.trainingResultSha256 === receipt.trainingResultSha256
        && existing.bundleId === receipt.bundleId
        && existing.datasetSha256 === receipt.datasetSha256
        && existing.configSha256 === receipt.configSha256
        && existing.handoffCreatedAt === receipt.handoffCreatedAt;
      if (!immutableFieldsMatch) throw new Error('Existing training handoff receipt conflicts with this registration');
      return;
    }
    await this.storage.set(NAMESPACE, receipt.id, structuredClone(receipt));
    const index = await this.storage.get<string[]>(NAMESPACE, RECEIPT_INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, RECEIPT_INDEX_KEY, [receipt.id, ...index.filter((id) => id !== receipt.id)].slice(0, 1_000));
  }

  private receiptKey(candidateId: string): string {
    return `training-handoff-receipt:${candidateId.trim().slice(0, 180)}`;
  }
}

export const trainingRunHandoffService = new TrainingRunHandoffService();
