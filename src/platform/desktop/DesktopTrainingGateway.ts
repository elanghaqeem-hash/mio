import { createDesktopCapabilityRegistry } from '../../security/CapabilityRegistry';
import { SecureServiceGateway } from '../../services/SecureServiceGateway';
import type { CapabilityExecutionContext } from '../../types/capabilities';
import { getDesktopWorkspaceBridge } from './DesktopWorkspaceGateway';

export type DesktopTrainingPythonRuntime = 'python' | 'python3' | 'py';
export type DesktopTrainingJobMode = 'DRY_RUN' | 'TRAIN';
export type DesktopTrainingJobState = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

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
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  signal?: string;
  stdoutTail: string;
  stderrTail: string;
  resultFileRelativePath?: string;
  disclosure: string;
}

export interface DesktopTrainingBridge {
  startTrainingJob: (request: DesktopTrainingStartInput) => Promise<{ success: boolean; job?: DesktopTrainingJobSnapshot; error?: string }>;
  getTrainingJob: (jobId: string) => Promise<{ success: boolean; job?: DesktopTrainingJobSnapshot; error?: string }>;
  listTrainingJobs: () => Promise<{ success: boolean; jobs?: DesktopTrainingJobSnapshot[]; error?: string }>;
  cancelTrainingJob: (jobId: string) => Promise<{ success: boolean; job?: DesktopTrainingJobSnapshot; error?: string }>;
}

const WORKSPACE_ID = /^ws_[a-zA-Z0-9-]+$/;
const JOB_ID = /^training-job:[0-9]+:[a-f0-9-]+$/i;
const MAX_PATH = 4096;
const MAX_LOG = 64 * 1024;

export function buildDesktopTrainingScopePath(input: DesktopTrainingStartInput): string {
  return `mode=${input.mode}|runtime=${input.pythonRuntime}|bundle=${input.bundleRelativePath}|output=${input.outputRelativePath ?? '-'}`;
}

function validStartInput(input: unknown): input is DesktopTrainingStartInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<DesktopTrainingStartInput>;
  if (typeof value.workspaceId !== 'string' || !WORKSPACE_ID.test(value.workspaceId)) return false;
  if (typeof value.bundleRelativePath !== 'string' || value.bundleRelativePath.length < 1 || value.bundleRelativePath.length > MAX_PATH || value.bundleRelativePath.includes('\u0000')) return false;
  if (value.outputRelativePath !== undefined && (typeof value.outputRelativePath !== 'string' || value.outputRelativePath.length < 1 || value.outputRelativePath.length > MAX_PATH || value.outputRelativePath.includes('\u0000'))) return false;
  if (value.pythonRuntime !== 'python' && value.pythonRuntime !== 'python3' && value.pythonRuntime !== 'py') return false;
  if (value.mode !== 'DRY_RUN' && value.mode !== 'TRAIN') return false;
  if (value.mode === 'DRY_RUN' && value.outputRelativePath !== undefined) return false;
  if (value.mode === 'TRAIN' && typeof value.outputRelativePath !== 'string') return false;
  return true;
}

function validJob(job: DesktopTrainingJobSnapshot): boolean {
  return job.schemaVersion === 1
    && JOB_ID.test(job.id)
    && (job.state === 'RUNNING' || job.state === 'SUCCEEDED' || job.state === 'FAILED' || job.state === 'CANCELLED')
    && (job.mode === 'DRY_RUN' || job.mode === 'TRAIN')
    && (job.pythonRuntime === 'python' || job.pythonRuntime === 'python3' || job.pythonRuntime === 'py')
    && WORKSPACE_ID.test(job.workspaceId)
    && typeof job.bundleRelativePath === 'string'
    && job.bundleRelativePath.length > 0
    && job.bundleRelativePath.length <= MAX_PATH
    && Number.isSafeInteger(job.startedAt)
    && job.startedAt > 0
    && typeof job.stdoutTail === 'string'
    && job.stdoutTail.length <= MAX_LOG
    && typeof job.stderrTail === 'string'
    && job.stderrTail.length <= MAX_LOG
    && typeof job.disclosure === 'string'
    && job.disclosure.length > 0;
}

function scopeMatches(input: DesktopTrainingStartInput, context: CapabilityExecutionContext): boolean {
  return context.resourceId === input.workspaceId && context.path === buildDesktopTrainingScopePath(input);
}

export function getDesktopTrainingBridge(): DesktopTrainingBridge | undefined {
  const bridge = getDesktopWorkspaceBridge() as (ReturnType<typeof getDesktopWorkspaceBridge> & Partial<DesktopTrainingBridge>) | undefined;
  return bridge
    && typeof bridge.startTrainingJob === 'function'
    && typeof bridge.getTrainingJob === 'function'
    && typeof bridge.listTrainingJobs === 'function'
    && typeof bridge.cancelTrainingJob === 'function'
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
