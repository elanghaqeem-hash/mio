import * as fs from 'fs';
import { TrainingHandoffPackager, type TrainingHandoffPackageReceipt } from './trainingHandoffPackager';
import { TrainingJobManager } from './trainingJobManager';
import { WorkspaceSandbox } from './workspaceSandbox';

export interface ReadTrainingHandoffRequest {
  jobId: string;
  workspaceId: string;
}

export interface TrainingHandoffReadResult {
  schemaVersion: 1;
  kind: 'MIO_TRAINING_HANDOFF_READ_RESULT_V1';
  trainingJobId: string;
  readWorkspaceId: string;
  handoffRelativePath: string;
  handoffSha256: string;
  bytes: number;
  handoffJson: string;
  receipt: TrainingHandoffPackageReceipt;
  disclosure: string;
}

const MAX_HANDOFF_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

export class TrainingHandoffReader {
  constructor(
    private readonly workspaceSandbox: WorkspaceSandbox,
    private readonly trainingJobs: TrainingJobManager,
    private readonly packager: TrainingHandoffPackager,
  ) {}

  public async read(request: ReadTrainingHandoffRequest): Promise<TrainingHandoffReadResult> {
    const receipt = this.packager.getReceipt(request.jobId);
    if (!receipt) throw new Error('TP-0.64 requires an existing TP-0.63 packaging receipt');
    const job = this.trainingJobs.get(request.jobId);
    if (!job || job.mode !== 'TRAIN' || job.state !== 'SUCCEEDED') throw new Error('TP-0.64 requires the matching successful governed TRAIN job');
    if (receipt.trainingJobId !== job.id
      || receipt.bundleId !== job.trainingIdentity.bundleId
      || receipt.datasetSha256 !== job.trainingIdentity.datasetSha256
      || receipt.configSha256 !== job.trainingIdentity.configSha256) {
      throw new Error('TP-0.63 receipt no longer matches the immutable governed training-job identity');
    }

    const handoffPath = await this.workspaceSandbox.resolveExisting(request.workspaceId, receipt.handoffRelativePath);
    const stat = await fs.promises.lstat(handoffPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Governed training handoff must be a regular non-symlink file');
    if (stat.size <= 0 || stat.size > MAX_HANDOFF_BYTES) throw new Error('Governed training handoff exceeds the bounded 64 MiB read contract');
    const handoffJson = await fs.promises.readFile(handoffPath, 'utf8');
    if (handoffJson.includes('\u0000')) throw new Error('Governed training handoff contains invalid null-delimited content');

    let parsed: unknown;
    try { parsed = JSON.parse(handoffJson); }
    catch { throw new Error('Governed training handoff is invalid JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Governed training handoff must be a JSON object');
    const handoff = parsed as {
      schemaVersion?: unknown;
      kind?: unknown;
      handoffSha256?: unknown;
      bundle?: { manifest?: { bundleId?: unknown } };
      fingerprints?: { datasetSha256?: unknown; configSha256?: unknown };
    };
    if (handoff.schemaVersion !== 1 || handoff.kind !== 'MIO_TRAINING_RUN_HANDOFF_V1') throw new Error('Governed training handoff schema/kind is invalid');
    if (handoff.handoffSha256 !== receipt.handoffSha256 || typeof handoff.handoffSha256 !== 'string' || !SHA256.test(handoff.handoffSha256)) throw new Error('Governed training handoff SHA-256 identity differs from the TP-0.63 receipt');
    if (handoff.bundle?.manifest?.bundleId !== receipt.bundleId) throw new Error('Governed training handoff bundleId differs from the TP-0.63 receipt');
    if (handoff.fingerprints?.datasetSha256 !== receipt.datasetSha256) throw new Error('Governed training handoff dataset SHA-256 differs from the TP-0.63 receipt');
    if (handoff.fingerprints?.configSha256 !== receipt.configSha256) throw new Error('Governed training handoff config SHA-256 differs from the TP-0.63 receipt');

    return {
      schemaVersion: 1,
      kind: 'MIO_TRAINING_HANDOFF_READ_RESULT_V1',
      trainingJobId: job.id,
      readWorkspaceId: request.workspaceId,
      handoffRelativePath: receipt.handoffRelativePath,
      handoffSha256: receipt.handoffSha256,
      bytes: stat.size,
      handoffJson,
      receipt: structuredClone(receipt),
      disclosure: 'Bounded TP-0.64 read of the fixed handoff path from an explicitly re-authorized workspace. Renderer verification remains mandatory before explicit candidate registration. This read does not register, benchmark, promote, activate, upload, publish, or deploy a model.',
    };
  }
}
