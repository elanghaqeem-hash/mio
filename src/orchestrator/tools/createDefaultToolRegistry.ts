import { ProjectManager } from '../../project/ProjectManager';
import { ResearchEngine } from '../../research/ResearchEngine';
import { defaultCapabilityRegistry } from '../../security/CapabilityRegistry';
import { ResearchReport } from '../../types/research';
import { creativeExecutionTool } from './CreativeExecutionTool';
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
    networkAccess: false,
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
    networkAccess: true,
    validateInput: (input: unknown): input is { query: string } => {
      if (!input || typeof input !== 'object') return false;
      const query = (input as { query?: unknown }).query;
      return typeof query === 'string' && query.trim().length > 0 && query.length <= 1000;
    },
    execute: async (input, context) => new ResearchEngine().research(input.query, context.signal),
    validateOutput: (output: ResearchReport) => Array.isArray(output.sources) && Array.isArray(output.providerErrors),
  });

  if (!defaultCapabilityRegistry.get('creative.execute')) {
    defaultCapabilityRegistry.register({
      id: 'creative.execute',
      kind: 'TOOL',
      description: 'Execute MIO native Creative Engine generation inside the current governed project and persist validated creative assets.',
      ownerLayer: 'ORCHESTRATOR',
      modes: ['3D', 'ANIMATION', 'MOTION_2D', 'GRAPHIC', 'DRAWING', 'PHOTO', 'SFX', 'MUSIC'],
      riskLevel: 'MODERATE',
      permissionLevel: 'L2_CREATE',
      availability: 'AVAILABLE',
      networkAccess: false,
      scopeFields: ['TASK', 'PROJECT', 'TOOL'],
      timeoutMs: 30000,
    });
  }
  registry.register(creativeExecutionTool);

  return registry;
}
