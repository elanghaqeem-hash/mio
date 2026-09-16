import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import type { TrainingCandidateRecord } from './TrainingCandidateRegistry';
import { TrainingCandidateRegistry } from './TrainingCandidateRegistry';
import {
  verifyTrainingRunHandoff,
  type TrainingRunHandoffVerification,
} from './TrainingRunHandoff';

export interface RegisterTrainingRunHandoffInput {
  handoffJson: string;
  runtimeModel: string;
  artifactUri: string;
  displayName?: string;
}

export interface RegisterTrainingRunHandoffResult {
  candidate: TrainingCandidateRecord;
  verification: TrainingRunHandoffVerification;
}

export class TrainingRunHandoffService {
  private readonly candidates: TrainingCandidateRegistry;

  constructor(storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
  }

  public async verify(handoffJson: string): Promise<TrainingRunHandoffVerification> {
    return verifyTrainingRunHandoff(handoffJson);
  }

  public async register(input: RegisterTrainingRunHandoffInput): Promise<RegisterTrainingRunHandoffResult> {
    const verification = await this.verify(input.handoffJson);
    if (!verification.valid || !verification.bundle || !verification.result) {
      throw new Error(`Training run handoff registration blocked: ${verification.errors.join('; ') || 'handoff verification failed'}`);
    }
    const registered = await this.candidates.register({
      bundle: verification.bundle.manifest,
      result: verification.result,
      runtimeModel: input.runtimeModel,
      artifactUri: input.artifactUri,
      displayName: input.displayName,
    });
    return { candidate: registered.candidate, verification };
  }
}

export const trainingRunHandoffService = new TrainingRunHandoffService();
