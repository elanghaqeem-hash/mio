// MIO-PRV-00.08 (T-18, from #520): typed bridge between the agent and File Intelligence.
// It only plans and validates. It never mutates files, never runs a search against an index,
// and never calls a model; AI routing is described by ModelRouter (ADR-001), not chosen here.
import { validateOrganizationManifest, type OrganizationManifest } from '../file-intelligence/SmartOrganizer';
import { validateSmartSearchQuery, type SmartSearchQuery } from '../file-intelligence/SmartSearch';
import { ModelRouter } from './ModelRouter';

export type AgentFileAction = 'SEARCH' | 'ORGANIZE_PREVIEW' | 'AI_ROUTE';
export type AgentFileRequest =
  | { action: 'SEARCH'; query: SmartSearchQuery }
  | { action: 'ORGANIZE_PREVIEW'; manifest: OrganizationManifest }
  | { action: 'AI_ROUTE' };
export type AgentFileStatus = 'READY' | 'UNAVAILABLE' | 'REJECTED';
export interface AgentFileResult {
  action: AgentFileAction;
  status: AgentFileStatus;
  payload: unknown;
  mutationExecuted: false;
}

const result = (action: AgentFileAction, status: AgentFileStatus, payload: unknown): AgentFileResult => ({ action, status, payload, mutationExecuted: false });
const reason = (error: unknown): { reason: string } => ({ reason: error instanceof Error ? error.message : 'Invalid request' });

export function planAgentFileAction(input: AgentFileRequest): AgentFileResult {
  switch (input.action) {
    case 'SEARCH':
      try { return result('SEARCH', 'READY', validateSmartSearchQuery(input.query)); } catch (error) { return result('SEARCH', 'REJECTED', reason(error)); }
    case 'ORGANIZE_PREVIEW':
      // A manifest that claims mutation rights is rejected: the bridge only ever produces previews.
      if ((input.manifest as { mutationAllowed?: unknown }).mutationAllowed !== false) return result('ORGANIZE_PREVIEW', 'REJECTED', { reason: 'Organization manifests must not allow mutation' });
      try { return result('ORGANIZE_PREVIEW', 'READY', validateOrganizationManifest(input.manifest)); } catch (error) { return result('ORGANIZE_PREVIEW', 'REJECTED', reason(error)); }
    case 'AI_ROUTE': {
      const route = ModelRouter.describeRoute();
      return result('AI_ROUTE', route.blockedReason ? 'UNAVAILABLE' : 'READY', route);
    }
  }
}
