import { defaultStorageProvider } from '../storage/StorageRuntime';
import { StorageProvider } from '../storage/StorageProvider';
import { MioTrainingExample, MioTrainingLanguage } from './TrainingDataset';

export type MioFeedbackRating = 'POSITIVE' | 'NEGATIVE' | 'CORRECTED';

export interface MioFeedbackRecord {
  id: string;
  requestId: string;
  provider: string;
  model: string;
  rating: MioFeedbackRating;
  createdAt: number;
  prompt?: string;
  response?: string;
  correction?: string;
  trainingConsent: boolean;
  privacyReviewed: boolean;
  notes?: string;
}

const NAMESPACE = 'training' as const;
const INDEX_KEY = 'feedback-index-v1';
const MAX_TEXT_CHARS = 16_000;

const bounded = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, MAX_TEXT_CHARS) : undefined;
};

const normalize = (record: MioFeedbackRecord): MioFeedbackRecord => ({
  ...record,
  id: record.id.trim().slice(0, 128),
  requestId: record.requestId.trim().slice(0, 128),
  provider: record.provider.trim().slice(0, 100),
  model: record.model.trim().slice(0, 200),
  prompt: bounded(record.prompt),
  response: bounded(record.response),
  correction: bounded(record.correction),
  notes: bounded(record.notes)?.slice(0, 2_000),
  trainingConsent: record.trainingConsent === true,
  privacyReviewed: record.privacyReviewed === true,
});

export class FeedbackCollector {
  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {}

  public async record(record: MioFeedbackRecord): Promise<void> {
    const normalized = normalize(record);
    if (!normalized.id || !normalized.requestId) throw new Error('Feedback requires id and requestId');
    if (!normalized.provider || !normalized.model) throw new Error('Feedback requires provider and model');
    if (normalized.rating === 'CORRECTED' && !normalized.correction) throw new Error('Corrected feedback requires correction text');

    await this.storage.set(NAMESPACE, normalized.id, normalized);
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const next = [normalized.id, ...index.filter((id) => id !== normalized.id)].slice(0, 2_000);
    await this.storage.set(NAMESPACE, INDEX_KEY, next);
  }

  public async list(limit = 100): Promise<MioFeedbackRecord[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const output: MioFeedbackRecord[] = [];
    for (const id of index.slice(0, Math.max(1, Math.min(limit, 500)))) {
      const record = await this.storage.get<MioFeedbackRecord>(NAMESPACE, id);
      if (record) output.push(normalize(record));
    }
    return output;
  }

  public async toTrainingCandidate(
    feedbackId: string,
    language: MioTrainingLanguage = 'mixed',
  ): Promise<MioTrainingExample | undefined> {
    const feedback = await this.storage.get<MioFeedbackRecord>(NAMESPACE, feedbackId);
    if (!feedback) return undefined;
    const normalized = normalize(feedback);
    if (!normalized.trainingConsent || !normalized.privacyReviewed || !normalized.prompt || !normalized.correction) return undefined;

    return {
      schemaVersion: 1,
      id: `feedback:${normalized.id}`,
      domain: 'GENERAL',
      language,
      messages: [
        { role: 'user', content: normalized.prompt },
        { role: 'assistant', content: normalized.correction },
      ],
      provenance: {
        kind: 'USER_CONTRIBUTED',
        createdAt: normalized.createdAt,
        sourceUri: `mio-feedback://${normalized.id}`,
      },
      eligibility: {
        trainingApproved: false,
        privacyReviewed: true,
        copyrightReviewed: false,
      },
      quality: {
        factuality: 0,
        instructionFollowing: 0,
        safety: 0,
      },
      tags: ['feedback-candidate', normalized.provider, normalized.model],
    };
  }
}
