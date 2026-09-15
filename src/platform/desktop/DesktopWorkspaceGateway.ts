import { createDesktopCapabilityRegistry } from '../../security/CapabilityRegistry';
import { SecureServiceGateway } from '../../services/SecureServiceGateway';
import type { CapabilityExecutionContext } from '../../types/capabilities';

export interface DesktopWorkspaceDescriptor {
  id: string;
  name: string;
}

export interface DesktopWorkspaceEntry {
  name: string;
  type: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER';
}

export interface DesktopWorkspaceBridge {
  authorizeWorkspace: () => Promise<{ success: boolean; cancelled?: boolean; workspace?: DesktopWorkspaceDescriptor; error?: string }>;
  revokeWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  readWorkspaceText: (request: { workspaceId: string; relativePath: string }) => Promise<{ success: boolean; data?: string; bytes?: number; error?: string }>;
  listWorkspace: (request: { workspaceId: string; relativePath: string }) => Promise<{ success: boolean; entries?: DesktopWorkspaceEntry[]; error?: string }>;
}

export interface WorkspaceReadInput {
  workspaceId: string;
  relativePath: string;
}

export interface WorkspaceReadOutput {
  text: string;
  bytes: number;
}

export interface WorkspaceListInput {
  workspaceId: string;
  relativePath: string;
}

export interface WorkspaceListOutput {
  entries: DesktopWorkspaceEntry[];
}

function validWorkspaceInput(input: unknown): input is WorkspaceReadInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<WorkspaceReadInput>;
  return typeof value.workspaceId === 'string' && /^ws_[a-zA-Z0-9-]+$/.test(value.workspaceId)
    && typeof value.relativePath === 'string' && value.relativePath.length <= 4096;
}

function scopeMatchesWorkspaceInput(input: WorkspaceReadInput, context: CapabilityExecutionContext): boolean {
  return context.resourceId === input.workspaceId && context.path === input.relativePath;
}

export function getDesktopWorkspaceBridge(): DesktopWorkspaceBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { mioDesktop?: DesktopWorkspaceBridge }).mioDesktop;
}

export function createDesktopWorkspaceGateway(bridge: DesktopWorkspaceBridge): SecureServiceGateway {
  const gateway = new SecureServiceGateway(createDesktopCapabilityRegistry());

  gateway.register<WorkspaceReadInput, WorkspaceReadOutput>({
    id: 'service.desktop.workspace.read-text',
    validateInput: validWorkspaceInput,
    validateScope: scopeMatchesWorkspaceInput,
    execute: async (input) => {
      const result = await bridge.readWorkspaceText(input);
      if (!result.success || typeof result.data !== 'string') throw new Error(result.error ?? 'Desktop workspace text read failed');
      return { text: result.data, bytes: result.bytes ?? new TextEncoder().encode(result.data).length };
    },
    validateOutput: (output) => typeof output.text === 'string' && Number.isFinite(output.bytes) && output.bytes >= 0,
  });

  gateway.register<WorkspaceListInput, WorkspaceListOutput>({
    id: 'service.desktop.workspace.list',
    validateInput: validWorkspaceInput,
    validateScope: scopeMatchesWorkspaceInput,
    execute: async (input) => {
      const result = await bridge.listWorkspace(input);
      if (!result.success || !Array.isArray(result.entries)) throw new Error(result.error ?? 'Desktop workspace directory listing failed');
      return { entries: result.entries };
    },
    validateOutput: (output) => Array.isArray(output.entries) && output.entries.every((entry) => typeof entry.name === 'string'),
  });

  return gateway;
}

export async function authorizeDesktopWorkspace(bridge: DesktopWorkspaceBridge = getRequiredDesktopBridge()): Promise<DesktopWorkspaceDescriptor | null> {
  const result = await bridge.authorizeWorkspace();
  if (result.cancelled) return null;
  if (!result.success || !result.workspace) throw new Error(result.error ?? 'Desktop workspace authorization failed');
  return result.workspace;
}

export async function revokeDesktopWorkspace(workspaceId: string, bridge: DesktopWorkspaceBridge = getRequiredDesktopBridge()): Promise<boolean> {
  const result = await bridge.revokeWorkspace(workspaceId);
  if (!result.success && result.error) throw new Error(result.error);
  return result.success;
}

export function getRequiredDesktopBridge(): DesktopWorkspaceBridge {
  const bridge = getDesktopWorkspaceBridge();
  if (!bridge) throw new Error('MIO desktop workspace bridge is unavailable in this runtime');
  return bridge;
}
