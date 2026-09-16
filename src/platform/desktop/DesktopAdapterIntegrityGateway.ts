import { createDesktopCapabilityRegistry } from '../../security/CapabilityRegistry';
import { SecureServiceGateway } from '../../services/SecureServiceGateway';
import type { CapabilityExecutionContext } from '../../types/capabilities';
import { getDesktopWorkspaceBridge } from './DesktopWorkspaceGateway';

export interface AdapterIntegrityFileHash {
  relativePath: string;
  bytes: number;
  sha256: string;
}

export interface AdapterIntegrityHashOutput {
  schemaVersion: 1;
  algorithm: 'SHA-256';
  canonicalization: 'mio-adapter-tree-v1';
  rootRelativePath: string;
  fingerprint: string;
  fileCount: number;
  totalBytes: number;
  files: AdapterIntegrityFileHash[];
  limits: { maxFiles: number; maxBytes: number; maxDepth: number };
}

export interface AdapterIntegrityHashInput {
  workspaceId: string;
  relativePath: string;
}

export interface DesktopAdapterIntegrityBridge {
  hashWorkspaceTree: (request: AdapterIntegrityHashInput) => Promise<{
    success: boolean;
    result?: AdapterIntegrityHashOutput;
    error?: string;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;
const WORKSPACE_ID = /^ws_[a-zA-Z0-9-]+$/;

function validInput(input: unknown): input is AdapterIntegrityHashInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<AdapterIntegrityHashInput>;
  return typeof value.workspaceId === 'string'
    && WORKSPACE_ID.test(value.workspaceId)
    && typeof value.relativePath === 'string'
    && value.relativePath.length <= 4096;
}

function scopeMatches(input: AdapterIntegrityHashInput, context: CapabilityExecutionContext): boolean {
  return context.resourceId === input.workspaceId && context.path === input.relativePath;
}

function validFile(item: AdapterIntegrityFileHash): boolean {
  return typeof item.relativePath === 'string'
    && item.relativePath.length > 0
    && item.relativePath.length <= 4096
    && !item.relativePath.startsWith('/')
    && !item.relativePath.includes('\\')
    && Number.isSafeInteger(item.bytes)
    && item.bytes >= 0
    && SHA256.test(item.sha256);
}

function validOutput(output: AdapterIntegrityHashOutput): boolean {
  return output.schemaVersion === 1
    && output.algorithm === 'SHA-256'
    && output.canonicalization === 'mio-adapter-tree-v1'
    && typeof output.rootRelativePath === 'string'
    && output.rootRelativePath.length <= 4096
    && SHA256.test(output.fingerprint)
    && Number.isSafeInteger(output.fileCount)
    && output.fileCount > 0
    && Number.isSafeInteger(output.totalBytes)
    && output.totalBytes >= 0
    && Array.isArray(output.files)
    && output.files.length === output.fileCount
    && output.files.every(validFile)
    && Number.isSafeInteger(output.limits.maxFiles)
    && Number.isSafeInteger(output.limits.maxBytes)
    && Number.isSafeInteger(output.limits.maxDepth);
}

export function getDesktopAdapterIntegrityBridge(): DesktopAdapterIntegrityBridge | undefined {
  const bridge = getDesktopWorkspaceBridge() as (ReturnType<typeof getDesktopWorkspaceBridge> & Partial<DesktopAdapterIntegrityBridge>) | undefined;
  return bridge && typeof bridge.hashWorkspaceTree === 'function' ? bridge as DesktopAdapterIntegrityBridge : undefined;
}

export function createDesktopAdapterIntegrityGateway(bridge: DesktopAdapterIntegrityBridge): SecureServiceGateway {
  const gateway = new SecureServiceGateway(createDesktopCapabilityRegistry());
  gateway.register<AdapterIntegrityHashInput, AdapterIntegrityHashOutput>({
    id: 'service.desktop.workspace.hash-tree',
    validateInput: validInput,
    validateScope: scopeMatches,
    execute: async (input) => {
      const response = await bridge.hashWorkspaceTree(input);
      if (!response.success || !response.result) throw new Error(response.error ?? 'Desktop adapter integrity scan failed');
      return response.result;
    },
    validateOutput: validOutput,
  });
  return gateway;
}

export function getRequiredDesktopAdapterIntegrityBridge(): DesktopAdapterIntegrityBridge {
  const bridge = getDesktopAdapterIntegrityBridge();
  if (!bridge) throw new Error('MIO desktop adapter-integrity bridge is unavailable in this runtime');
  return bridge;
}
