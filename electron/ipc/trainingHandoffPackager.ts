import { app } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { TrainingJobManager, type TrainingJobSnapshot } from './trainingJobManager';
import { WorkspaceSandbox } from './workspaceSandbox';

export interface PackageTrainingHandoffRequest {
  jobId: string;
  workspaceId: string;
  bundleRelativePath: string;
  resultFileRelativePath: string;
  handoffRelativePath: string;
}

export interface TrainingHandoffPackageReceipt {
  schemaVersion: 1;
  kind: 'MIO_TRAINING_HANDOFF_PACKAGE_RECEIPT_V1';
  trainingJobId: string;
  workspaceId: string;
  bundleRelativePath: string;
  resultFileRelativePath: string;
  handoffRelativePath: string;
  bundleId: string;
  datasetSha256: string;
  configSha256: string;
  handoffSha256: string;
  packagedAt: number;
  disclosure: string;
}

const MAX_PROCESS_OUTPUT_CHARS = 64 * 1024;
const MAX_HANDOFF_BYTES = 64 * 1024 * 1024;
const PACKAGING_TIMEOUT_MS = 60_000;
const SHA256 = /^[a-f0-9]{64}$/;

function expectedHandoffRelativePath(job: TrainingJobSnapshot): string {
  if (!job.resultFileRelativePath) throw new Error('Successful training job does not declare a result-file path');
  const normalized = job.resultFileRelativePath.replace(/\\/g, '/');
  const directory = path.posix.dirname(normalized);
  return directory === '.' ? 'mio-training-handoff.json' : `${directory}/mio-training-handoff.json`;
}

function packagingEnv(): NodeJS.ProcessEnv {
  const allow = ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allow) if (process.env[key] !== undefined) env[key] = process.env[key];
  env.ELECTRON_RUN_AS_NODE = '1';
  env.MIO_GOVERNED_HANDOFF_PACKAGING = '1';
  return env;
}

export class TrainingHandoffPackager {
  private readonly receipts = new Map<string, TrainingHandoffPackageReceipt>();

  constructor(
    private readonly workspaceSandbox: WorkspaceSandbox,
    private readonly trainingJobs: TrainingJobManager,
  ) {}

  public async packageJob(request: PackageTrainingHandoffRequest): Promise<TrainingHandoffPackageReceipt> {
    const job = this.requireMatchingSuccessfulJob(request);
    const existing = this.receipts.get(job.id);
    if (existing) return structuredClone(existing);

    const bundlePath = await this.workspaceSandbox.resolveExisting(job.workspaceId, job.bundleRelativePath);
    const resultPath = await this.workspaceSandbox.resolveExisting(job.workspaceId, job.resultFileRelativePath!);
    const resultStat = await fs.promises.lstat(resultPath);
    if (!resultStat.isFile() || resultStat.isSymbolicLink()) throw new Error('Training result must be a regular file inside the authorized workspace');

    const handoffRelativePath = expectedHandoffRelativePath(job);
    const resultDirectory = path.dirname(resultPath);
    const handoffPath = path.join(resultDirectory, 'mio-training-handoff.json');
    const canonicalResultDirectory = await fs.promises.realpath(resultDirectory);
    const canonicalWorkspaceResultDirectory = await this.workspaceSandbox.resolveExisting(job.workspaceId, path.posix.dirname(job.resultFileRelativePath!.replace(/\\/g, '/')));
    if (canonicalResultDirectory !== canonicalWorkspaceResultDirectory) throw new Error('Training result directory no longer matches the authorized workspace path');
    if (await this.exists(handoffPath)) throw new Error('Governed handoff already exists; TP-0.63 never overwrites an existing handoff file');

    const packagerPath = await this.resolvePackagerPath();
    const stdout = await this.runPackager(packagerPath, bundlePath, resultPath, handoffPath);
    let output: unknown;
    try { output = JSON.parse(stdout.trim()); }
    catch { await this.removeIfExists(handoffPath); throw new Error('Governed TP-0.58 packager returned invalid JSON status'); }
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      await this.removeIfExists(handoffPath);
      throw new Error('Governed TP-0.58 packager returned an invalid status object');
    }
    const status = output as { state?: unknown; kind?: unknown; handoffSha256?: unknown };
    if (status.state !== 'HANDOFF_CREATED' || status.kind !== 'MIO_TRAINING_RUN_HANDOFF_V1' || typeof status.handoffSha256 !== 'string' || !SHA256.test(status.handoffSha256)) {
      await this.removeIfExists(handoffPath);
      throw new Error('Governed TP-0.58 packager status contract is invalid');
    }

    const packaged = await this.readAndValidateGeneratedHandoff(handoffPath, job, status.handoffSha256);
    const receipt: TrainingHandoffPackageReceipt = {
      schemaVersion: 1,
      kind: 'MIO_TRAINING_HANDOFF_PACKAGE_RECEIPT_V1',
      trainingJobId: job.id,
      workspaceId: job.workspaceId,
      bundleRelativePath: job.bundleRelativePath,
      resultFileRelativePath: job.resultFileRelativePath!,
      handoffRelativePath,
      bundleId: job.trainingIdentity.bundleId,
      datasetSha256: job.trainingIdentity.datasetSha256,
      configSha256: job.trainingIdentity.configSha256,
      handoffSha256: packaged.handoffSha256,
      packagedAt: Date.now(),
      disclosure: 'TP-0.63 receipt for a handoff created from the exact workspace paths bound to a successful TP-0.62 TRAIN job. The fixed TP-0.58 packager re-verifies bundle/result consistency. This receipt does not register, benchmark, promote, activate, upload, publish, or deploy the model.',
    };
    this.receipts.set(job.id, receipt);
    return structuredClone(receipt);
  }

  public getReceipt(jobId: string): TrainingHandoffPackageReceipt | undefined {
    const receipt = this.receipts.get(jobId);
    return receipt ? structuredClone(receipt) : undefined;
  }

  private requireMatchingSuccessfulJob(request: PackageTrainingHandoffRequest): TrainingJobSnapshot {
    const job = this.trainingJobs.get(request.jobId);
    if (!job) throw new Error(`Governed training job '${request.jobId}' was not found`);
    if (job.mode !== 'TRAIN' || job.state !== 'SUCCEEDED') throw new Error('TP-0.63 packaging requires a successful TP-0.62 TRAIN job');
    if (!job.resultFileRelativePath) throw new Error('Successful training job is missing the fixed training-result path');
    const expectedHandoff = expectedHandoffRelativePath(job);
    if (request.workspaceId !== job.workspaceId
      || request.bundleRelativePath !== job.bundleRelativePath
      || request.resultFileRelativePath !== job.resultFileRelativePath
      || request.handoffRelativePath !== expectedHandoff) {
      throw new Error('TP-0.63 packaging request does not match the immutable training-job workspace/path scope');
    }
    return job;
  }

  private async readAndValidateGeneratedHandoff(
    handoffPath: string,
    job: TrainingJobSnapshot,
    statusHash: string,
  ): Promise<{ handoffSha256: string }> {
    try {
      const stat = await fs.promises.lstat(handoffPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Generated handoff is not a regular file');
      if (stat.size <= 0 || stat.size > MAX_HANDOFF_BYTES) throw new Error('Generated handoff exceeds the bounded 64 MiB contract');
      const handoff = JSON.parse(await fs.promises.readFile(handoffPath, 'utf8')) as {
        schemaVersion?: unknown;
        kind?: unknown;
        handoffSha256?: unknown;
        bundle?: { manifest?: { bundleId?: unknown } };
        fingerprints?: { datasetSha256?: unknown; configSha256?: unknown };
      };
      if (handoff.schemaVersion !== 1 || handoff.kind !== 'MIO_TRAINING_RUN_HANDOFF_V1') throw new Error('Generated handoff schema/kind is invalid');
      if (handoff.handoffSha256 !== statusHash || typeof handoff.handoffSha256 !== 'string' || !SHA256.test(handoff.handoffSha256)) throw new Error('Generated handoff SHA-256 does not match packager status');
      if (handoff.bundle?.manifest?.bundleId !== job.trainingIdentity.bundleId) throw new Error('Generated handoff bundleId does not match the pre-training job identity');
      if (handoff.fingerprints?.datasetSha256 !== job.trainingIdentity.datasetSha256) throw new Error('Generated handoff dataset SHA-256 does not match the pre-training job identity');
      if (handoff.fingerprints?.configSha256 !== job.trainingIdentity.configSha256) throw new Error('Generated handoff config SHA-256 does not match the pre-training job identity');
      return { handoffSha256: handoff.handoffSha256 };
    } catch (error) {
      await this.removeIfExists(handoffPath);
      throw error;
    }
  }

  private async resolvePackagerPath(): Promise<string> {
    const trustedRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'scripts', 'training')
      : path.join(app.getAppPath(), 'scripts', 'training');
    const expected = path.join(trustedRoot, 'create-training-run-handoff.mjs');
    const stat = await fs.promises.lstat(expected);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Fixed TP-0.58 handoff packager is missing or not a regular file');
    const [canonicalRoot, canonicalPackager] = await Promise.all([fs.promises.realpath(trustedRoot), fs.promises.realpath(expected)]);
    const relative = path.relative(canonicalRoot, canonicalPackager);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Fixed TP-0.58 handoff packager escapes its trusted application resource');
    return canonicalPackager;
  }

  private runPackager(packagerPath: string, bundlePath: string, resultPath: string, handoffPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [packagerPath, '--bundle', bundlePath, '--result', resultPath, '--output', handoffPath], {
        shell: false,
        windowsHide: true,
        cwd: path.dirname(packagerPath),
        env: packagingEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve(stdout);
      };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string | Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > MAX_PROCESS_OUTPUT_CHARS) {
          child.kill('SIGKILL');
          finish(new Error('TP-0.58 packager stdout exceeded the bounded output limit'));
        }
      });
      child.stderr?.on('data', (chunk: string | Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > MAX_PROCESS_OUTPUT_CHARS) {
          child.kill('SIGKILL');
          finish(new Error('TP-0.58 packager stderr exceeded the bounded output limit'));
        }
      });
      child.once('error', (error) => finish(new Error(`TP-0.58 packager process failed: ${error.message}`)));
      child.once('close', (code, signal) => {
        if (settled) return;
        if (code !== 0) finish(new Error(`TP-0.58 packager failed (${code ?? signal ?? 'unknown'}): ${stderr.trim().slice(-2000)}`));
        else finish();
      });
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error(`TP-0.58 packager exceeded ${PACKAGING_TIMEOUT_MS} ms`));
      }, PACKAGING_TIMEOUT_MS);
      timeout.unref();
    });
  }

  private async exists(filePath: string): Promise<boolean> {
    try { await fs.promises.lstat(filePath); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async removeIfExists(filePath: string): Promise<void> {
    try { await fs.promises.unlink(filePath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
