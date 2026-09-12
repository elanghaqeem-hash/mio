import { ProjectManager } from '../../project/ProjectManager';
import { ResearchEngine } from '../../research/ResearchEngine';
import { ResearchReport } from '../../types/research';
import { ToolRegistry } from './ToolRegistry';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    id: 'project.inspect',
    description: 'Read current project identity, active mode, and asset summary without modifying project state.',
    modes: ['CHAT', 'PROJECT'],
    riskLevel: 'LOW',
    permissionLevel: 'L1_SUGGEST',
    timeoutMs: 2000,
    validateInput: (input: unknown): input is Record<string, never> => typeof input === 'object' && input !== null,
    execute: async () => {
      const project = ProjectManager.getProject();
      return {
        id: project.id,
        name: project.name,
        activeMode: project.activeMode,
        assetCount: project.assets.length,
        lastModified: project.lastModified,
      };
    },
    validateOutput: (output) => Boolean(output && typeof output === 'object' && 'id' in output && 'assetCount' in output),
  });

  registry.register({
    id: 'research.search',
    description: 'Search configured external research providers and return sanitized, source-aware research results.',
    modes: ['CHAT', 'RESEARCH'],
    riskLevel: 'HIGH',
    permissionLevel: 'L4_EXECUTE',
    timeoutMs: 20000,
    validateInput: (input: unknown): input is { query: string } => {
      if (!input || typeof input !== 'object') return false;
      const query = (input as { query?: unknown }).query;
      return typeof query === 'string' && query.trim().length > 0 && query.length <= 1000;
    },
    execute: async (input) => new ResearchEngine().research(input.query),
    validateOutput: (output: ResearchReport) => Array.isArray(output.sources) && Array.isArray(output.providerErrors),
  });

  return registry;
}
