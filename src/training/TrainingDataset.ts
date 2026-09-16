export type MioTrainingDomain =
  | 'GENERAL'
  | 'REASONING'
  | 'CODING'
  | 'RESEARCH'
  | 'TOOL_USE'
  | 'PROJECT_KNOWLEDGE'
  | 'CREATIVE'
  | 'SAFETY';

export type MioTrainingLanguage = 'id' | 'en' | 'mixed' | 'other';
export type MioTrainingProvenanceKind = 'CURATED' | 'SYNTHETIC' | 'LICENSED' | 'USER_CONTRIBUTED';

export interface MioTrainingMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MioTrainingProvenance {
  kind: MioTrainingProvenanceKind;
  sourceUri?: string;
  license?: string;
  createdAt: number;
  reviewer?: string;
}

export interface MioTrainingEligibility {
  trainingApproved: boolean;
  privacyReviewed: boolean;
  copyrightReviewed: boolean;
}

export interface MioTrainingQuality {
  factuality: number;
  instructionFollowing: number;
  safety: number;
  toolUse?: number;
}

export interface MioTrainingExample {
  schemaVersion: 1;
  id: string;
  domain: MioTrainingDomain;
  language: MioTrainingLanguage;
  messages: MioTrainingMessage[];
  provenance: MioTrainingProvenance;
  eligibility: MioTrainingEligibility;
  quality: MioTrainingQuality;
  tags?: string[];
}

export interface TrainingValidationResult {
  valid: boolean;
  errors: string[];
}

const SCORE_MIN = 0;
const SCORE_MAX = 5;
const MAX_MESSAGES = 32;
const MAX_CONTENT_CHARS = 32_000;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;

const scoreValid = (value: number | undefined): boolean =>
  value === undefined || (Number.isFinite(value) && value >= SCORE_MIN && value <= SCORE_MAX);

export function validateTrainingExample(example: MioTrainingExample): TrainingValidationResult {
  const errors: string[] = [];
  if (example.schemaVersion !== 1) errors.push('Unsupported training schema version');
  if (!ID_PATTERN.test(example.id)) errors.push('Training example id is invalid');
  if (!Array.isArray(example.messages) || example.messages.length < 2 || example.messages.length > MAX_MESSAGES) {
    errors.push(`Training examples require 2-${MAX_MESSAGES} messages`);
  }

  for (const [index, message] of example.messages.entries()) {
    if (!['system', 'user', 'assistant'].includes(message.role)) errors.push(`Message ${index + 1} has an invalid role`);
    if (!message.content.trim()) errors.push(`Message ${index + 1} is empty`);
    if (message.content.length > MAX_CONTENT_CHARS) errors.push(`Message ${index + 1} exceeds ${MAX_CONTENT_CHARS} characters`);
  }

  if (example.messages.at(-1)?.role !== 'assistant') errors.push('Training example must end with an assistant response');
  if (!scoreValid(example.quality.factuality)) errors.push('Factuality score must be between 0 and 5');
  if (!scoreValid(example.quality.instructionFollowing)) errors.push('Instruction-following score must be between 0 and 5');
  if (!scoreValid(example.quality.safety)) errors.push('Safety score must be between 0 and 5');
  if (!scoreValid(example.quality.toolUse)) errors.push('Tool-use score must be between 0 and 5');

  if (example.provenance.kind === 'LICENSED' && !example.provenance.license?.trim()) {
    errors.push('Licensed training data must declare its license');
  }
  if (example.provenance.kind === 'USER_CONTRIBUTED' && !example.eligibility.privacyReviewed) {
    errors.push('User-contributed data requires privacy review before training eligibility');
  }

  return { valid: errors.length === 0, errors };
}

export function isTrainingEligible(example: MioTrainingExample): boolean {
  const validation = validateTrainingExample(example);
  return validation.valid
    && example.eligibility.trainingApproved
    && example.eligibility.privacyReviewed
    && example.eligibility.copyrightReviewed
    && example.quality.factuality >= 4
    && example.quality.instructionFollowing >= 4
    && example.quality.safety >= 4;
}

export function exportEligibleTrainingJsonl(examples: MioTrainingExample[]): string {
  return examples
    .filter(isTrainingEligible)
    .map((example) => JSON.stringify({
      id: example.id,
      domain: example.domain,
      language: example.language,
      messages: example.messages,
      provenance: example.provenance,
      tags: example.tags ?? [],
    }))
    .join('\n');
}
