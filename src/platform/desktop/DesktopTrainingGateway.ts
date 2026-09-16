import { createDesktopCapabilityRegistry } from '../../security/CapabilityRegistry';
import { SecureServiceGateway } from '../../services/SecureServiceGateway';
import type { CapabilityExecutionContext } from '../../types/capabilities';
import { getDesktopWorkspaceBridge } from './DesktopWorkspaceGateway';

export type DesktopTrainingPythonRuntime = 'python' | 'python3' | 'py';
export type DesktopTrainingJobMode = 'DRY_RUN' | 'TRAIN';
export type DesktopTrainingJobState = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface DesktopTrainingBundleIdentity {
  bundleId: string;
  datasetSha256: string;
  configSha256: string;
}

export interface DesktopTrainingStartInput {
  workspaceId: string;
  bundleRelativePath: string;
  outputRelativePath?: string;
  pythonRuntime: DesktopTrainingPythonRuntime;
  mode: DesktopTrainingJobMode;
}

export interface DesktopTrainingJobSnapshot {
  schemaVersion: 1;
  id: string;
  state: DesktopTrainingJobState;
  mode: DesktopTrainingJobMode;
  pythonRuntime: DesktopTrainingPythonRuntime;
  workspaceId: string;
  bundleRelativePath: string;
  outputRelativePath?: string;
  trainingIdentity: DesktopTrainingBundleIdentity;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  signal?: string;
  stdoutTail: string;
  stderrTail: string;
  resultFileRelativePath?: string;
  disclosure: string;
}

export interface DesktopTrainingHandoffPackageInput {
  jobId: string;
  workspaceId: string;
  bundleRelativePath: string;
  resultFileRelativePath: string;
  handoffRelativePath: string;
}

export interface DesktopTrainingHandoffPackageReceipt {
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

export interface DesktopTrainingBridge {
  startTrainingJob: (request: DesktopTrainingStartInput) => Promise<{ success: boolean; job?: DesktopTrainingJobSnapshot; error?: string }>;
  getTrainingJob: (jobId: string) => Promise<{ success: boolean; job?: DesktopTrainingJobSnapshot; error?: string }>;
  listTrainingJobs: () => Promise<{ success: boolean; jobs?: DesktopTrainingJobSnapshot[]; error?: string }>;
  cancelTrainingJob: (jobId: string) => Promise<{ success: boolean; job?: DesktopTrainingJobSnapshot; error?: string }>;
  packageTrainingHandoff: (request: DesktopTrainingHandoffPackageInput) => Promise<{ success: boolean; receipt?: DesktopTrainingHandoffPackageReceipt; error?: string }>;
  getTrainingHandoffReceipt: (jobId: string) => Promise<{ success: boolean; receipt?: DesktopTrainingHandoffPackageReceipt; error?: string }>;
}

const WORKSPACE_ID = /^ws_[a-zA-Z0-9-]+$/;
const JOB_ID = /^training-job:[0-9]+:[a-f0-9-]+$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PATH = 4096;
const MAX_LOG = 64 * 1024;

export function expectedDesktopTrainingHandoffRelativePath(job: Pick<DesktopTrainingJobSnapshot, 'resultFileRelativePath'>): string {
  if (!job.resultFileRelativePath) throw new Error('Training job does not declare a result-file path');
  const normalized = job.resultFileRelativePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? `${normalized.slice(0, slash)}/mio-training-handoff.json` : 'mio-training-handoff.json';
}

export function buildDesktopTrainingScopePath(input: DesktopTrainingStartInput): string {
  return `mode=${input.mode}|runtime=${input.pythonRuntime}|bundle=${input.bundleRelativePath}|output=${input.outputRelativePath ?? '-'}`;
}

export function buildDesktopTrainingHandoffScopePath(input: DesktopTrainingHandoffPackageInput): string {
  return `job=${input.jobId}|bundle=${input.bundleRelativePath}|result=${input.resultFileRelativePath}|handoff=${input.handoffRelativePath}`;
}

function validPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PATH && !value.includes('\u0000');
}

function validIdentity(identity: DesktopTrainingBundleIdentity): boolean {
  return typeof identity?.bundleId === 'string'
    && /^mio-train-[a-f0-9]{12}-[a-f0-9]{12}$/.test(identity.bundleId)
    && SHA256.test(identity.datasetSha256)
    && SHA256.test(identity.configSha256);
}

function validStartInput(input: unknown): input is DesktopTrainingStartInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<DesktopTrainingStartInput>;
  if (typeof value.workspaceId !== 'string' || !WORKSPACE_ID.test(value.workspaceId)) return false;
  if (!validPath(value.bundleRelativePath)) return false;
  if (value.outputRelativePath !== undefined && !validPath(value.outputRelativePath)) return false;
  if (value.pythonRuntime !== 'python' && value.pythonRuntime !== 'python3' && value.pythonRuntime !== 'py') return false;
  if (value.mode !== 'DRY_RUN' && value.mode !== 'TRAIN') return false;
  if (value.mode === 'DRY_RUN' && value.outputRelativePath !== undefined) return false;
  if (value.mode === 'TRAIN' && typeof value.outputRelativePath !== 'string') return false;
  return true;
}

function validPackageInput(input: unknown): input is DesktopTrainingHandoffPackageInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<DesktopTrainingHandoffPackageInput>;
  return typeof value.jobId === 'string'
    && JOB_ID.test(value.jobId)
    && typeof value.workspaceId === 'string'
    && WORKSPACE_ID.test(value.workspaceId)
    && validPath(value.bundleRelativePath)
    && validPath(value.resultFileRelativePath)
    && validPath(value.handoffRelativePath);
}

function validJob(job: DesktopTrainingJobSnapshot): boolean {
  return job.schemaVersion === 1
    && JOB_ID.test(job.id)
    && (job.state === 'RUNNING' || job.state === 'SUCCEEDED' || job.state === 'FAILED' || job.state === 'CANCELLED')
    && (job.mode === 'DRY_RUN' || job.mode === 'TRAIN')
    && (job.pythonRuntime === 'python' || job.pythonRuntime === 'python3' || job.pythonRuntime === 'py')
    && WORKSPACE_ID.test(job.workspaceId)
    && validPath(job.bundleRelativePath)
    && validIdentity(job.trainingIdentity)
    && Number.isSafeInteger(job.startedAt)
    && job.startedAt > 0
    && typeof job.stdoutTail === 'string'
    && job.stdoutTail.length <= MAX_LOG
    && typeof job.stderrTail === 'string'
    && job.stderrTail.length <= MAX_LOG
    && typeof job.disclosure === 'string'
    && job.disclosure.length > 0;
}

function validReceipt(receipt: DesktopTrainingHandoffPackageReceipt): boolean {
  return receipt.schemaVersion === 1
    && receipt.kind === 'MIO_TRAINING_HANDOFF_PACKAGE_RECEIPT_V1'
    && JOB_ID.test(receipt.trainingJobId)
    && WORKSPACE_ID.test(receipt.workspaceId)
    && validPath(receipt.bundleRelativePath)
    && validPath(receipt.resultFileRelativePath)
    && validPath(receipt.handoffRelativePath)
    && /^mio-train-[a-f0-9]{12}-[a-f0-9]{12}$/.test(receipt.bundleId)
    && SHA256.test(receipt.datasetSha256)
    && SHA256.test(receipt.configSha256)
    && SHA256.test(receipt.handoffSha256)
    && Number.isSafeInteger(receipt.packagedAt)
    && receipt.packagedAt > 0
    && typeof receipt.disclosure === 'string'
    && receipt.disclosure.length > 0;
}

function scopeMatches(input: DesktopTrainingStartInput, context: CapabilityExecutionContext): boolean {
  return context.resourceId === input.workspaceId && context.path === buildDesktopTrainingScopePath(input);
}

function handoffScopeMatches(input: DesktopTrainingHandoffPackageInput, context: CapabilityExecutionContext): boolean {
  return context.resourceId === input.workspaceId && context.path === buildDesktopTrainingHandoffScopePath(input);
}

export function getDesktopTrainingBridge(): DesktopTrainingBridge | undefined {
  const bridge = getDesktopWorkspaceBridge() as (ReturnType<typeof getDesktopWorkspaceBridge> & Partial<DesktopTrainingBridge>) | undefined;
  return bridge
    && typeof bridge.startTrainingJob === 'function'
    && typeof bridge.getTrainingJob === 'function'
    && typeof bridge.listTrainingJobs === 'function'
    && typeof bridge.cancelTrainingJob === 'function'
    && typeof bridge.packageTrainingHandoff === 'function'
    && typeof bridge.getTrainingHandoffReceipt === 'function'
    ? bridge as DesktopTrainingBridge
    : undefined;
}

export function getRequiredDesktopTrainingBridge(): DesktopTrainingBridge {
  const bridge = getDesktopTrainingBridge();
  if (!bridge) throw new Error('MIO governed desktop training bridge is unavailable in this runtime');
  return bridge;
}

export function createDesktopTrainingGateway(bridge: DesktopTrainingBridge): SecureServiceGateway {
  const gateway = new SecureServiceGateway(createDesktopCapabilityRegistry());
  gateway.register<DesktopTrainingStartInput, DesktopTrainingJobSnapshot>({
    id: 'service.desktop.training.start',
    validateInput: validStartInput,
    validateScope: scopeMatches,
    execute: async (input) => {
      const response = await bridge.startTrainingJob(input);
      if (!response.success || !response.job) throw new Error(response.error ?? 'Governed local training start failed');
      return response.job;
    },
    validateOutput: validJob,
  });
  gateway.register<DesktopTrainingHandoffPackageInput, DesktopTrainingHandoffPackageReceipt>({
    id: 'service.desktop.training.package-handoff',
    validateInput: validPackageInput,
    validateScope: handoffScopeMatches,
    execute: async (input) => {
      const response = await bridge.packageTrainingHandoff(input);
      if (!response.success || !response.receipt) throw new Error(response.error ?? 'Governed TP-0.58 handoff packaging failed');
      return response.receipt;
    },
    validateOutput: validReceipt,
  });
  return gateway;
}

export async function startGovernedDesktopTraining(
  input: DesktopTrainingStartInput,
  taskId: string,
  bridge: DesktopTrainingBridge = getRequiredDesktopTrainingBridge(),
): Promise<DesktopTrainingJobSnapshot> {
  const gateway = createDesktopTrainingGateway(bridge);
  const result = await gateway.execute<DesktopTrainingJobSnapshot>(
    'service.desktop.training.start',
    input,
    {
      taskId,
      mode: 'SETTINGS',
      requestedBy: 'USER',
      resourceId: input.workspaceId,
      path: buildDesktopTrainingScopePath(input),
    },
  );
  if (!result.success || !result.data) throw new Error(result.error ?? 'Governed local training start was blocked');
  return result.data;
}

export async function packageGovernedDesktopTrainingHandoff(
  job: DesktopTrainingJobSnapshot,
  taskId: string,
  bridge: DesktopTrainingBridge = getRequiredDesktopTrainingBridge(),
): Promise<DesktopTrainingHandoffPackageReceipt> {
  if (!validJob(job) || job.mode !== 'TRAIN' || job.state !== 'SUCCEEDED' || !job.resultFileRelativePath) {
    throw new Error('TP-0.63 packaging requires a valid successful governed TRAIN job');
  }
  const input: DesktopTrainingHandoffPackageInput = {
    jobId: job.id,
    workspaceId: job.workspaceId,
    bundleRelativePath: job.bundleRelativePath,
    resultFileRelativePath: job.resultFileRelativePath,
    handoffRelativePath: expectedDesktopTrainingHandoffRelativePath(job),
  };
  const gateway = createDesktopTrainingGateway(bridge);
  const result = await gateway.execute<DesktopTrainingHandoffPackageReceipt>(
    'service.desktop.training.package-handoff',
    input,
    {
      taskId,
      mode: 'SETTINGS',
      requestedBy: 'USER',
      resourceId: input.workspaceId,
      path: buildDesktopTrainingHandoffScopePath(input),
    },
  );
  if (!result.success || !result.data) throw new Error(result.error ?? 'Governed TP-0.58 handoff packaging was blocked');
  if (result.data.trainingJobId !== job.id
    || result.data.bundleId !== job.trainingIdentity.bundleId
    || result.data.datasetSha256 !== job.trainingIdentity.datasetSha256
    || result.data.configSha256 !== job.trainingIdentity.configSha256) {
    throw new Error('TP-0.63 receipt does not match the training job identity');
  }
  return result.data;
}

export async function getGovernedDesktopTrainingHandoffReceipt(
  jobId: string,
  bridge: DesktopTrainingBridge = getRequiredDesktopTrainingBridge(),
): Promise<DesktopTrainingHandoffPackageReceipt | undefined> {
  if (!JOB_ID.test(jobId)) throw new Error('Invalid governed training job id');
  const response = await bridge.getTrainingHandoffReceipt(jobId);
  if (!response.success) return undefined;
  if (!response.receipt || !validReceipt(response.receipt)) throw new Error('Governed handoff packaging receipt failed validation');
  return response.receipt;
}

export async function getGovernedDesktopTrainingJob(
  jobId: string,
  bridge: DesktopTrainingBridge = getRequiredDesktopTrainingBridge(),
): Promise<DesktopTrainingJobSnapshot> {
  if (!JOB_ID.test(jobId)) throw new Error('Invalid governed training job id');
  const response = await bridge.getTrainingJob(jobId);
  if (!response.success || !response.job || !validJob(response.job)) throw new Error(response.error ?? 'Governed training job status failed validation');
  return response.job;
}

export async function listGovernedDesktopTrainingJobs(
  bridge: DesktopTrainingBridge = getRequiredDesktopTrainingBridge(),
): Promise<DesktopTrainingJobSnapshot[]> {
  const response = await bridge.listTrainingJobs();
  if (!response.success || !Array.isArray(response.jobs) || !response.jobs.every(validJob)) throw new Error(response.error ?? 'Governed training job history failed validation');
  return response.jobs.slice(0, 20);
}

export async function cancelGovernedDesktopTrainingJob(
  jobId: string,
  bridge: DesktopTrainingBridge = getRequiredDesktopTrainingBridge(),
): Promise<DesktopTrainingJobSnapshot> {
  if (!JOB_ID.test(jobId)) throw new Error('Invalid governed training job id');
  const response = await bridge.cancelTrainingJob(jobId);
  if (!response.success || !response.job || !validJob(response.job)) throw new Error(response.error ?? 'Governed training cancellation failed validation');
  return response.job;
}
