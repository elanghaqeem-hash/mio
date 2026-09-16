import { createDesktopCapabilityRegistry } from '../../security/CapabilityRegistry';
import { SecureServiceGateway } from '../../services/SecureServiceGateway';
import type { CapabilityExecutionContext } from '../../types/capabilities';
import { getDesktopWorkspaceBridge } from './DesktopWorkspaceGateway';
import type { DesktopTrainingHandoffPackageReceipt } from './DesktopTrainingGateway';

export interface DesktopTrainingHandoffReadInput {
  jobId: string;
  workspaceId: string;
  handoffRelativePath: string;
  handoffSha256: string;
}

export interface DesktopTrainingHandoffReadResult {
  schemaVersion: 1;
  kind: 'MIO_TRAINING_HANDOFF_READ_RESULT_V1';
  trainingJobId: string;
  readWorkspaceId: string;
  handoffRelativePath: string;
  handoffSha256: string;
  bytes: number;
  handoffJson: string;
  receipt: DesktopTrainingHandoffPackageReceipt;
  disclosure: string;
}

export interface DesktopTrainingHandoffReadBridge {
  readTrainingHandoff: (request: { jobId: string; workspaceId: string }) => Promise<{ success: boolean; result?: DesktopTrainingHandoffReadResult; error?: string }>;
}

const JOB_ID = /^training-job:[0-9]+:[a-f0-9-]+$/i;
const WORKSPACE_ID = /^ws_[a-zA-Z0-9-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PATH = 4096;
const MAX_HANDOFF_BYTES = 64 * 1024 * 1024;

export function buildDesktopTrainingHandoffReadScopePath(input: DesktopTrainingHandoffReadInput): string {
  return `job=${input.jobId}|handoff=${input.handoffRelativePath}|sha256=${input.handoffSha256}`;
}

function validPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PATH && !value.includes('\u0000');
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
    && receipt.packagedAt > 0;
}

function validInput(input: unknown): input is DesktopTrainingHandoffReadInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<DesktopTrainingHandoffReadInput>;
  return typeof value.jobId === 'string'
    && JOB_ID.test(value.jobId)
    && typeof value.workspaceId === 'string'
    && WORKSPACE_ID.test(value.workspaceId)
    && validPath(value.handoffRelativePath)
    && typeof value.handoffSha256 === 'string'
    && SHA256.test(value.handoffSha256);
}

function validResult(result: DesktopTrainingHandoffReadResult): boolean {
  return result.schemaVersion === 1
    && result.kind === 'MIO_TRAINING_HANDOFF_READ_RESULT_V1'
    && JOB_ID.test(result.trainingJobId)
    && WORKSPACE_ID.test(result.readWorkspaceId)
    && validPath(result.handoffRelativePath)
    && SHA256.test(result.handoffSha256)
    && Number.isSafeInteger(result.bytes)
    && result.bytes > 0
    && result.bytes <= MAX_HANDOFF_BYTES
    && typeof result.handoffJson === 'string'
    && result.handoffJson.length > 0
    && result.handoffJson.length <= MAX_HANDOFF_BYTES
    && !result.handoffJson.includes('\u0000')
    && validReceipt(result.receipt)
    && typeof result.disclosure === 'string'
    && result.disclosure.length > 0;
}

function scopeMatches(input: DesktopTrainingHandoffReadInput, context: CapabilityExecutionContext): boolean {
  return context.resourceId === input.workspaceId && context.path === buildDesktopTrainingHandoffReadScopePath(input);
}

export function getDesktopTrainingHandoffReadBridge(): DesktopTrainingHandoffReadBridge | undefined {
  const bridge = getDesktopWorkspaceBridge() as (ReturnType<typeof getDesktopWorkspaceBridge> & Partial<DesktopTrainingHandoffReadBridge>) | undefined;
  return bridge && typeof bridge.readTrainingHandoff === 'function' ? bridge as DesktopTrainingHandoffReadBridge : undefined;
}

export function createDesktopTrainingHandoffIngestionGateway(bridge: DesktopTrainingHandoffReadBridge): SecureServiceGateway {
  const gateway = new SecureServiceGateway(createDesktopCapabilityRegistry());
  gateway.register<DesktopTrainingHandoffReadInput, DesktopTrainingHandoffReadResult>({
    id: 'service.desktop.training.read-handoff',
    validateInput: validInput,
    validateScope: scopeMatches,
    execute: async (input) => {
      const response = await bridge.readTrainingHandoff({ jobId: input.jobId, workspaceId: input.workspaceId });
      if (!response.success || !response.result) throw new Error(response.error ?? 'Governed training handoff read failed');
      return response.result;
    },
    validateOutput: validResult,
  });
  return gateway;
}

export async function readGovernedDesktopTrainingHandoff(
  receipt: DesktopTrainingHandoffPackageReceipt,
  workspaceId: string,
  taskId: string,
  bridge: DesktopTrainingHandoffReadBridge = getDesktopTrainingHandoffReadBridge() as DesktopTrainingHandoffReadBridge,
): Promise<DesktopTrainingHandoffReadResult> {
  if (!bridge) throw new Error('MIO governed training handoff read bridge is unavailable in this runtime');
  if (!validReceipt(receipt)) throw new Error('TP-0.63 receipt failed renderer validation');
  const input: DesktopTrainingHandoffReadInput = {
    jobId: receipt.trainingJobId,
    workspaceId,
    handoffRelativePath: receipt.handoffRelativePath,
    handoffSha256: receipt.handoffSha256,
  };
  const gateway = createDesktopTrainingHandoffIngestionGateway(bridge);
  const response = await gateway.execute<DesktopTrainingHandoffReadResult>(
    'service.desktop.training.read-handoff',
    input,
    {
      taskId,
      mode: 'SETTINGS',
      requestedBy: 'USER',
      resourceId: workspaceId,
      path: buildDesktopTrainingHandoffReadScopePath(input),
    },
  );
  if (!response.success || !response.data) throw new Error(response.error ?? 'Governed training handoff read was blocked');
  const result = response.data;
  if (result.trainingJobId !== receipt.trainingJobId
    || result.handoffRelativePath !== receipt.handoffRelativePath
    || result.handoffSha256 !== receipt.handoffSha256
    || result.receipt.bundleId !== receipt.bundleId
    || result.receipt.datasetSha256 !== receipt.datasetSha256
    || result.receipt.configSha256 !== receipt.configSha256) {
    throw new Error('TP-0.64 handoff read result does not match the TP-0.63 receipt identity');
  }
  return result;
}
