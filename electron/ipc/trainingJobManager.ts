import { app } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { WorkspaceSandbox } from './workspaceSandbox';

export type TrainingPythonRuntime = 'python' | 'python3' | 'py';
export type TrainingJobMode = 'DRY_RUN' | 'TRAIN';
export type TrainingJobState = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface StartTrainingJobRequest {
  workspaceId: string;
  bundleRelativePath: string;
  outputRelativePath?: string;
  pythonRuntime: TrainingPythonRuntime;
  mode: TrainingJobMode;
}

export interface TrainingJobSnapshot {
  schemaVersion: 1;
  id: string;
  state: TrainingJobState;
  mode: TrainingJobMode;
  pythonRuntime: TrainingPythonRuntime;
  workspaceId: string;
  bundleRelativePath: string;
  outputRelativePath?: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  signal?: string;
  stdoutTail: string;
  stderrTail: string;
  resultFileRelativePath?: string;
  disclosure: string;
}

interface TrainingJobRecord extends TrainingJobSnapshot {
  process?: ChildProcess;
  cancelRequested?: boolean;
}

const MAX_LOG_CHARS = 64 * 1024;
const MAX_JOBS = 50;
const SAFE_RUNTIME = new Set<TrainingPythonRuntime>(['python', 'python3', 'py']);
const SAFE_RELATIVE_PATH = /^[^\u0000]{1,4096}$/;

function tail(value: string): string {
  return value.length <= MAX_LOG_CHARS ? value : value.slice(value.length - MAX_LOG_CHARS);
}

function sanitizedTrainingEnv(): NodeJS.ProcessEnv {
  const allow = [
    'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE',
    'VIRTUAL_ENV', 'CONDA_PREFIX', 'CUDA_VISIBLE_DEVICES', 'CUDA_DEVICE_ORDER', 'CUDA_HOME', 'CUDA_PATH',
    'LD_LIBRARY_PATH',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allow) if (process.env[key] !== undefined) env[key] = process.env[key];
  env.PYTHONUNBUFFERED = '1';
  env.HF_HUB_OFFLINE = '1';
  env.TRANSFORMERS_OFFLINE = '1';
  env.HF_DATASETS_OFFLINE = '1';
  env.WANDB_DISABLED = 'true';
  env.TOKENIZERS_PARALLELISM = 'false';
  env.MIO_GOVERNED_TRAINING = '1';
  return env;
}

export class TrainingJobManager {
  private readonly jobs = new Map<string, TrainingJobRecord>();
  private readonly order: string[] = [];

  constructor(private readonly workspaceSandbox: WorkspaceSandbox) {}

  public async start(request: StartTrainingJobRequest): Promise<TrainingJobSnapshot> {
    this.validateRequest(request);
    if ([...this.jobs.values()].some((job) => job.state === 'RUNNING')) {
      throw new Error('A governed local training job is already running; concurrent GPU training is intentionally blocked');
    }

    const bundlePath = await this.workspaceSandbox.resolveExisting(request.workspaceId, request.bundleRelativePath);
    const bundleStat = await fs.promises.stat(bundlePath);
    if (!bundleStat.isDirectory()) throw new Error('Training bundle path must resolve to a directory');

    let outputPath: string | undefined;
    if (request.mode === 'TRAIN') {
      if (!request.outputRelativePath) throw new Error('Real training requires an existing empty output directory inside the authorized workspace');
      outputPath = await this.workspaceSandbox.resolveExisting(request.workspaceId, request.outputRelativePath);
      const outputStat = await fs.promises.stat(outputPath);
      if (!outputStat.isDirectory()) throw new Error('Training output path must resolve to a directory');
      if ((await fs.promises.readdir(outputPath)).length > 0) throw new Error('Training output directory must be empty; automatic overwrite is intentionally disabled');
      const outputInsideBundle = path.relative(bundlePath, outputPath);
      if (outputInsideBundle === '' || (!outputInsideBundle.startsWith(`..${path.sep}`) && outputInsideBundle !== '..' && !path.isAbsolute(outputInsideBundle))) {
        throw new Error('Training output directory must be outside the governed bundle directory');
      }
    }

    const runnerPath = await this.resolveRunnerPath();
    const command = request.pythonRuntime === 'py' ? 'py' : request.pythonRuntime;
    const args = request.pythonRuntime === 'py' ? ['-3', runnerPath, '--bundle', bundlePath] : [runnerPath, '--bundle', bundlePath];
    if (request.mode === 'DRY_RUN') args.push('--dry-run');
    else args.push('--output', outputPath as string);

    const id = `training-job:${Date.now()}:${crypto.randomUUID()}`;
    const record: TrainingJobRecord = {
      schemaVersion: 1,
      id,
      state: 'RUNNING',
      mode: request.mode,
      pythonRuntime: request.pythonRuntime,
      workspaceId: request.workspaceId,
      bundleRelativePath: request.bundleRelativePath,
      ...(request.outputRelativePath ? { outputRelativePath: request.outputRelativePath } : {}),
      startedAt: Date.now(),
      stdoutTail: '',
      stderrTail: '',
      ...(request.mode === 'TRAIN' && request.outputRelativePath ? { resultFileRelativePath: `${request.outputRelativePath.replace(/[\\/]+$/g, '')}/mio-training-result.json` } : {}),
      disclosure: 'Governed local TP-0.46 runner execution. The fixed bundled runner is launched without a shell, with a bounded environment and Hugging Face/Transformers/Datasets offline flags. Completion remains TRAINED_NOT_EVALUATED and never promotes, activates, uploads, or deploys a model.',
    };

    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      cwd: path.dirname(runnerPath),
      env: sanitizedTrainingEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    record.process = child;
    this.jobs.set(id, record);
    this.order.unshift(id);
    this.trimHistory();

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string | Buffer) => { record.stdoutTail = tail(record.stdoutTail + chunk.toString()); });
    child.stderr?.on('data', (chunk: string | Buffer) => { record.stderrTail = tail(record.stderrTail + chunk.toString()); });
    child.once('error', (error) => {
      if (record.state !== 'RUNNING') return;
      record.stderrTail = tail(`${record.stderrTail}\nPROCESS ERROR: ${error.message}`);
      record.state = record.cancelRequested ? 'CANCELLED' : 'FAILED';
      record.finishedAt = Date.now();
      delete record.process;
    });
    child.once('close', (code, signal) => {
      if (record.state !== 'RUNNING') return;
      record.exitCode = typeof code === 'number' ? code : undefined;
      record.signal = signal ?? undefined;
      record.finishedAt = Date.now();
      record.state = record.cancelRequested ? 'CANCELLED' : code === 0 ? 'SUCCEEDED' : 'FAILED';
      delete record.process;
    });

    return this.snapshot(record);
  }

  public get(jobId: string): TrainingJobSnapshot | undefined {
    const record = this.jobs.get(jobId);
    return record ? this.snapshot(record) : undefined;
  }

  public list(limit = 20): TrainingJobSnapshot[] {
    const bounded = Math.max(1, Math.min(limit, MAX_JOBS));
    return this.order
      .slice(0, bounded)
      .map((id) => this.jobs.get(id))
      .filter((record): record is TrainingJobRecord => Boolean(record))
      .map((record) => this.snapshot(record));
  }

  public hasRunningForWorkspace(workspaceId: string): boolean {
    return [...this.jobs.values()].some((job) => job.workspaceId === workspaceId && job.state === 'RUNNING');
  }

  public cancel(jobId: string): TrainingJobSnapshot {
    const record = this.jobs.get(jobId);
    if (!record) throw new Error(`Training job '${jobId}' was not found`);
    if (record.state !== 'RUNNING' || !record.process) return this.snapshot(record);
    record.cancelRequested = true;
    record.stderrTail = tail(`${record.stderrTail}\nMIO: cancellation requested by user/emergency control.`);
    record.process.kill('SIGTERM');
    const processRef = record.process;
    setTimeout(() => {
      if (record.state === 'RUNNING') processRef.kill('SIGKILL');
    }, 3000).unref();
    return this.snapshot(record);
  }

  public cancelWorkspace(workspaceId: string): number {
    let cancelled = 0;
    for (const record of this.jobs.values()) {
      if (record.workspaceId === workspaceId && record.state === 'RUNNING' && record.process) {
        this.cancel(record.id);
        cancelled += 1;
      }
    }
    return cancelled;
  }

  public cancelAll(): void {
    for (const record of this.jobs.values()) {
      if (record.state === 'RUNNING' && record.process) this.cancel(record.id);
    }
  }

  public forceStopAll(): void {
    for (const record of this.jobs.values()) {
      if (record.state !== 'RUNNING' || !record.process) continue;
      record.cancelRequested = true;
      record.stderrTail = tail(`${record.stderrTail}\nMIO: process force-stopped during desktop authority shutdown.`);
      record.process.kill('SIGKILL');
    }
  }

  private validateRequest(request: StartTrainingJobRequest): void {
    if (!request || typeof request !== 'object') throw new Error('Training job request is required');
    if (!/^ws_[a-zA-Z0-9-]+$/.test(request.workspaceId)) throw new Error('Invalid training workspace authority id');
    if (!SAFE_RELATIVE_PATH.test(request.bundleRelativePath) || path.isAbsolute(request.bundleRelativePath)) throw new Error('Training bundle path must be a bounded relative path');
    if (request.outputRelativePath !== undefined && (!SAFE_RELATIVE_PATH.test(request.outputRelativePath) || path.isAbsolute(request.outputRelativePath))) throw new Error('Training output path must be a bounded relative path');
    if (!SAFE_RUNTIME.has(request.pythonRuntime)) throw new Error('Python runtime is not in the governed runtime whitelist');
    if (request.mode !== 'DRY_RUN' && request.mode !== 'TRAIN') throw new Error('Unsupported governed training job mode');
    if (request.mode === 'DRY_RUN' && request.outputRelativePath !== undefined) throw new Error('Dry-run mode must not declare an output path');
  }

  private async resolveRunnerPath(): Promise<string> {
    const expected = app.isPackaged
      ? path.join(process.resourcesPath, 'training', 'train_mio_lora.py')
      : path.join(app.getAppPath(), 'training', 'train_mio_lora.py');
    const stat = await fs.promises.lstat(expected);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Bundled governed training runner is missing or not a regular file');
    const canonical = await fs.promises.realpath(expected);
    const trustedRoot = await fs.promises.realpath(app.isPackaged ? path.join(process.resourcesPath, 'training') : path.join(app.getAppPath(), 'training'));
    const relative = path.relative(trustedRoot, canonical);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Governed training runner escapes the trusted application training resource');
    return canonical;
  }

  private trimHistory(): void {
    while (this.order.length > MAX_JOBS) {
      const id = this.order.pop();
      if (!id) break;
      const record = this.jobs.get(id);
      if (record?.state === 'RUNNING') {
        this.order.unshift(id);
        break;
      }
      this.jobs.delete(id);
    }
  }

  private snapshot(record: TrainingJobRecord): TrainingJobSnapshot {
    const { process: _process, cancelRequested: _cancelRequested, ...snapshot } = record;
    return structuredClone(snapshot);
  }
}
