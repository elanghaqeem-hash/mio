import { defaultStorageProvider } from '../storage/StorageRuntime';
import type { StorageProvider } from '../storage/StorageProvider';
import { ModelManifestRepository } from './ModelManifestRepository';
import { sha256Hex, stableJsonStringify } from './TrainingBundle';
import type { TrainingCandidateRecord } from './TrainingCandidateRegistry';
import { TrainingCandidateRegistry } from './TrainingCandidateRegistry';
import type { CandidateAdapterIntegrityEvidence } from './TrainingCandidateIntegrityService';
import { TrainingCandidateIntegrityService } from './TrainingCandidateIntegrityService';
import type { TrainingRunHandoffReceipt } from './TrainingRunHandoffService';
import { TrainingRunHandoffService } from './TrainingRunHandoffService';
import type { MioModelManifest } from './ModelManifest';

const NAMESPACE = 'training' as const;
const INDEX_KEY = 'training-artifact-binding-index-v1';
const SHA256 = /^[a-f0-9]{64}$/;

export interface TrainingArtifactBindingBody {
  schemaVersion: 1;
  candidateId: string;
  manifestId: string;
  handoffReceiptId: string;
  handoffSha256: string;
  trainingResultSha256: string;
  bundleId: string;
  datasetSha256: string;
  configSha256: string;
  integrityEvidenceId: string;
  adapterFingerprint: string;
  baselineFingerprint: string;
  integrityComparison: 'BASELINE_CAPTURED' | 'MATCH';
  runtimeModel: string;
  artifactUri: string;
  boundAt: number;
  disclosure: string;
}

export interface TrainingArtifactBindingEvidence extends TrainingArtifactBindingBody {
  id: string;
  bindingSha256: string;
}

export interface TrainingArtifactBindingVerification {
  valid: boolean;
  errors: string[];
  receipt?: TrainingRunHandoffReceipt;
  integrity?: CandidateAdapterIntegrityEvidence;
  binding?: TrainingArtifactBindingEvidence;
}

export interface TrainingArtifactBindingSnapshot {
  candidate?: TrainingCandidateRecord;
  manifest?: MioModelManifest;
  receipt?: TrainingRunHandoffReceipt;
  latestIntegrity?: CandidateAdapterIntegrityEvidence;
  latestBinding?: TrainingArtifactBindingEvidence;
  bindingValid: boolean;
  bindable: boolean;
  blockingReasons: string[];
}

function bindingBody(binding: TrainingArtifactBindingEvidence): TrainingArtifactBindingBody {
  return {
    schemaVersion: binding.schemaVersion,
    candidateId: binding.candidateId,
    manifestId: binding.manifestId,
    handoffReceiptId: binding.handoffReceiptId,
    handoffSha256: binding.handoffSha256,
    trainingResultSha256: binding.trainingResultSha256,
    bundleId: binding.bundleId,
    datasetSha256: binding.datasetSha256,
    configSha256: binding.configSha256,
    integrityEvidenceId: binding.integrityEvidenceId,
    adapterFingerprint: binding.adapterFingerprint,
    baselineFingerprint: binding.baselineFingerprint,
    integrityComparison: binding.integrityComparison,
    runtimeModel: binding.runtimeModel,
    artifactUri: binding.artifactUri,
    boundAt: binding.boundAt,
    disclosure: binding.disclosure,
  };
}

function currentEvidenceErrors(
  candidate: TrainingCandidateRecord,
  manifest: MioModelManifest,
  receipt?: TrainingRunHandoffReceipt,
  integrity?: CandidateAdapterIntegrityEvidence,
): string[] {
  const errors: string[] = [];
  if (!receipt) return ['Verified TP-0.58 training handoff receipt is unavailable'];
  if (receipt.candidateId !== candidate.id || receipt.manifestId !== manifest.id) errors.push('Training handoff receipt is not bound to the current candidate manifest');
  if (receipt.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Training handoff receipt result SHA-256 does not match candidate registration');
  if (receipt.bundleId !== candidate.bundleId) errors.push('Training handoff receipt bundle id does not match candidate registration');
  if (receipt.datasetSha256 !== candidate.datasetSha256) errors.push('Training handoff receipt dataset SHA-256 does not match candidate registration');
  if (receipt.configSha256 !== candidate.configSha256) errors.push('Training handoff receipt config SHA-256 does not match candidate registration');
  if (!SHA256.test(receipt.handoffSha256) || !SHA256.test(receipt.trainingResultSha256)) errors.push('Training handoff receipt fingerprint contract is invalid');

  if (!integrity) return [...errors, 'Current adapter byte-integrity evidence is unavailable'];
  if (integrity.candidateId !== candidate.id || integrity.manifestId !== manifest.id) errors.push('Adapter integrity evidence is not bound to the current candidate manifest');
  if (integrity.runtimeModel !== manifest.runtimeModel) errors.push('Adapter integrity runtime identity does not match candidate runtime model');
  if (integrity.artifactUri !== candidate.artifactUri) errors.push('Adapter integrity artifact identity does not match candidate artifact URI');
  if (integrity.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Adapter integrity training-result SHA-256 does not match candidate registration');
  if (!SHA256.test(integrity.fingerprint) || !SHA256.test(integrity.baselineFingerprint)) errors.push('Adapter integrity fingerprint contract is invalid');
  if (integrity.comparison === 'DRIFT') errors.push('Latest adapter byte-integrity evidence reports DRIFT');
  return [...new Set(errors)];
}

export class TrainingArtifactBindingService {
  private readonly candidates: TrainingCandidateRegistry;
  private readonly manifests: ModelManifestRepository;
  private readonly handoffs: TrainingRunHandoffService;
  private readonly integrity: TrainingCandidateIntegrityService;

  constructor(private readonly storage: StorageProvider = defaultStorageProvider) {
    this.candidates = new TrainingCandidateRegistry(storage);
    this.manifests = new ModelManifestRepository(storage);
    this.handoffs = new TrainingRunHandoffService(storage);
    this.integrity = new TrainingCandidateIntegrityService(storage);
  }

  public async inspect(candidateId: string): Promise<TrainingArtifactBindingSnapshot> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) return { bindingValid: false, bindable: false, blockingReasons: [`Training candidate '${candidateId}' is not registered`] };
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) return { candidate, bindingValid: false, bindable: false, blockingReasons: [`Model manifest '${candidate.manifestId}' is missing`] };
    const [receipt, latestIntegrity, latestBinding] = await Promise.all([
      this.handoffs.getReceipt(candidate.id),
      this.integrity.latest(candidate.id),
      this.latest(candidate.id),
    ]);
    const blockingReasons = currentEvidenceErrors(candidate, manifest, receipt, latestIntegrity);
    const verification = latestBinding
      ? await this.verifyBinding(latestBinding, candidate, manifest, receipt, latestIntegrity)
      : { valid: false, errors: ['Current handoff-to-adapter binding is unavailable'] };
    return {
      candidate,
      manifest,
      receipt,
      latestIntegrity,
      latestBinding,
      bindingValid: verification.valid,
      bindable: blockingReasons.length === 0,
      blockingReasons: [...new Set([...blockingReasons, ...(latestBinding && !verification.valid ? verification.errors : [])])],
    };
  }

  public async bind(candidateId: string): Promise<TrainingArtifactBindingEvidence> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) throw new Error(`Training candidate '${candidateId}' is not registered`);
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) throw new Error(`Model manifest '${candidate.manifestId}' is missing`);
    const [receipt, latestIntegrity, existing] = await Promise.all([
      this.handoffs.getReceipt(candidate.id),
      this.integrity.latest(candidate.id),
      this.latest(candidate.id),
    ]);
    const errors = currentEvidenceErrors(candidate, manifest, receipt, latestIntegrity);
    if (errors.length || !receipt || !latestIntegrity) throw new Error(`Training artifact binding blocked: ${errors.join('; ')}`);
    if (latestIntegrity.comparison === 'DRIFT') throw new Error('Training artifact binding blocked: latest adapter integrity evidence reports DRIFT');

    if (existing) {
      const verification = await this.verifyBinding(existing, candidate, manifest, receipt, latestIntegrity);
      if (verification.valid) return existing;
    }

    const boundAt = Date.now();
    const body: TrainingArtifactBindingBody = {
      schemaVersion: 1,
      candidateId: candidate.id,
      manifestId: manifest.id,
      handoffReceiptId: receipt.id,
      handoffSha256: receipt.handoffSha256,
      trainingResultSha256: candidate.trainingResultSha256,
      bundleId: candidate.bundleId,
      datasetSha256: candidate.datasetSha256,
      configSha256: candidate.configSha256,
      integrityEvidenceId: latestIntegrity.id,
      adapterFingerprint: latestIntegrity.fingerprint,
      baselineFingerprint: latestIntegrity.baselineFingerprint,
      integrityComparison: latestIntegrity.comparison,
      runtimeModel: manifest.runtimeModel,
      artifactUri: candidate.artifactUri,
      boundAt,
      disclosure: 'TP-0.59 evidence binding a verified TP-0.58 training handoff receipt to the current TP-0.50 adapter byte-integrity scan. This binding is not a benchmark, provenance signature, promotion decision, activation authorization, or proof of model safety.',
    };
    const bindingSha256 = await sha256Hex(stableJsonStringify(body));
    const evidence: TrainingArtifactBindingEvidence = {
      ...body,
      id: `training-artifact-binding:${candidate.id}:${boundAt}:${bindingSha256.slice(0, 12)}`,
      bindingSha256,
    };
    const selfVerification = await this.verifyBinding(evidence, candidate, manifest, receipt, latestIntegrity);
    if (!selfVerification.valid) throw new Error(`Training artifact binding self-verification failed: ${selfVerification.errors.join('; ')}`);
    await this.save(evidence);
    return structuredClone(evidence);
  }

  public async verifyLatest(candidateId: string): Promise<TrainingArtifactBindingVerification> {
    const candidate = await this.candidates.get(candidateId);
    if (!candidate) return { valid: false, errors: [`Training candidate '${candidateId}' is not registered`] };
    const manifest = await this.manifests.get(candidate.manifestId);
    if (!manifest) return { valid: false, errors: [`Model manifest '${candidate.manifestId}' is missing`] };
    const [receipt, integrity, binding] = await Promise.all([
      this.handoffs.getReceipt(candidate.id),
      this.integrity.latest(candidate.id),
      this.latest(candidate.id),
    ]);
    if (!binding) return { valid: false, errors: ['Current handoff-to-adapter binding is unavailable'], receipt, integrity };
    return this.verifyBinding(binding, candidate, manifest, receipt, integrity);
  }

  public async latest(candidateId: string): Promise<TrainingArtifactBindingEvidence | undefined> {
    const history = await this.list(candidateId, 1);
    return history[0];
  }

  public async list(candidateId: string, limit = 20): Promise<TrainingArtifactBindingEvidence[]> {
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    const output: TrainingArtifactBindingEvidence[] = [];
    for (const id of index) {
      const item = await this.storage.get<TrainingArtifactBindingEvidence>(NAMESPACE, id);
      if (item?.candidateId === candidateId) output.push(structuredClone(item));
      if (output.length >= Math.max(1, Math.min(limit, 500))) break;
    }
    return output;
  }

  private async verifyBinding(
    binding: TrainingArtifactBindingEvidence,
    candidate: TrainingCandidateRecord,
    manifest: MioModelManifest,
    receipt?: TrainingRunHandoffReceipt,
    integrity?: CandidateAdapterIntegrityEvidence,
  ): Promise<TrainingArtifactBindingVerification> {
    const errors = currentEvidenceErrors(candidate, manifest, receipt, integrity);
    if (binding.schemaVersion !== 1) errors.push('Unsupported training artifact binding schema');
    if (!SHA256.test(binding.bindingSha256)) errors.push('Training artifact binding SHA-256 is malformed');
    if (!Number.isSafeInteger(binding.boundAt) || binding.boundAt <= 0) errors.push('Training artifact binding timestamp is invalid');
    if (binding.candidateId !== candidate.id || binding.manifestId !== manifest.id) errors.push('Training artifact binding candidate identity is inconsistent');
    if (receipt) {
      if (binding.handoffReceiptId !== receipt.id) errors.push('Training artifact binding handoff receipt pointer is stale');
      if (binding.handoffSha256 !== receipt.handoffSha256) errors.push('Training artifact binding handoff SHA-256 does not match current receipt');
      if (binding.bundleId !== receipt.bundleId || binding.datasetSha256 !== receipt.datasetSha256 || binding.configSha256 !== receipt.configSha256) errors.push('Training artifact binding bundle fingerprints do not match current handoff receipt');
    }
    if (binding.trainingResultSha256 !== candidate.trainingResultSha256) errors.push('Training artifact binding result SHA-256 does not match candidate registration');
    if (binding.runtimeModel !== manifest.runtimeModel || binding.artifactUri !== candidate.artifactUri) errors.push('Training artifact binding runtime/artifact identity does not match current candidate');
    if (integrity) {
      if (binding.integrityEvidenceId !== integrity.id) errors.push('Training artifact binding is stale relative to the latest adapter integrity scan');
      if (binding.adapterFingerprint !== integrity.fingerprint || binding.baselineFingerprint !== integrity.baselineFingerprint) errors.push('Training artifact binding fingerprint does not match current adapter integrity evidence');
      if (binding.integrityComparison !== integrity.comparison) errors.push('Training artifact binding integrity comparison does not match current scan');
    }
    if (!binding.disclosure?.trim() || binding.disclosure.length > 1000) errors.push('Training artifact binding disclosure is invalid');
    try {
      const computed = await sha256Hex(stableJsonStringify(bindingBody(binding)));
      if (computed !== binding.bindingSha256) errors.push('Training artifact binding SHA-256 digest mismatch');
    } catch (error) {
      errors.push(`Training artifact binding digest could not be computed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    return {
      valid: errors.length === 0,
      errors: [...new Set(errors)],
      receipt,
      integrity,
      binding: structuredClone(binding),
    };
  }

  private async save(binding: TrainingArtifactBindingEvidence): Promise<void> {
    await this.storage.set(NAMESPACE, binding.id, structuredClone(binding));
    const index = await this.storage.get<string[]>(NAMESPACE, INDEX_KEY) ?? [];
    await this.storage.set(NAMESPACE, INDEX_KEY, [binding.id, ...index.filter((id) => id !== binding.id)].slice(0, 2_000));
  }
}

export const trainingArtifactBindingService = new TrainingArtifactBindingService();
