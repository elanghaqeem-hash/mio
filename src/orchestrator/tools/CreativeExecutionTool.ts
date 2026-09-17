import { CreativeOrchestrator, type CreativePlanStep } from '../../agents/CreativeOrchestrator';
import { creativeAssetHandoff } from '../../creative/CreativeAssetHandoff';
import { eventBus } from '../../core/EventBus';
import { ProjectManager } from '../../project/ProjectManager';
import type { MioSystemMode } from '../../types/core';
import type { MioTool } from '../../types/tools';

const CREATIVE_MODES: MioSystemMode[] = ['3D', 'ANIMATION', 'MOTION_2D', 'GRAPHIC', 'DRAWING', 'PHOTO', 'SFX', 'MUSIC'];

export interface CreativeExecutionInput {
  prompt: string;
  requestedMode?: MioSystemMode;
}

export interface CreativeExecutionOutput {
  mode: MioSystemMode;
  completed: boolean;
  steps: Array<{
    id: string;
    mode: string;
    status: CreativePlanStep['status'];
    outputAssetId?: string;
  }>;
  outputAssetIds: string[];
  primaryAssetId?: string;
}

export const creativeExecutionTool: MioTool<CreativeExecutionInput, CreativeExecutionOutput> = {
  id: 'creative.execute',
  description: 'Execute MIO native Creative Engine generation inside the current governed project and persist validated creative assets.',
  modes: CREATIVE_MODES,
  riskLevel: 'MODERATE',
  permissionLevel: 'L2_CREATE',
  timeoutMs: 30000,
  networkAccess: false,
  validateInput: (input: unknown): input is CreativeExecutionInput => {
    if (!input || typeof input !== 'object') return false;
    const candidate = input as Partial<CreativeExecutionInput>;
    return typeof candidate.prompt === 'string' && candidate.prompt.trim().length > 0 && candidate.prompt.length <= 8000;
  },
  execute: async (input, context) => {
    if (context.signal?.aborted) throw new Error('Creative execution cancelled');
    const requestedMode = input.requestedMode ?? context.mode;
    if (!CREATIVE_MODES.includes(requestedMode)) throw new Error(`Unsupported creative mode ${requestedMode}`);

    const planned = CreativeOrchestrator.planCreativePipeline(input.prompt);
    let steps = planned;

    if (requestedMode !== 'GRAPHIC') {
      const selected = planned.filter((step) => step.mode === requestedMode);
      if (selected.length > 0) {
        const selectedIds = new Set(selected.map((step) => step.id));
        steps = selected.map((step) => ({ ...step, dependsOnStepIds: step.dependsOnStepIds.filter((id) => selectedIds.has(id)) }));
      }
    }

    if (!steps.length) throw new Error(`Creative planner produced no executable ${requestedMode} step`);
    const completed = await CreativeOrchestrator.executePipeline(steps, () => {
      if (context.signal?.aborted) throw new Error('Creative execution cancelled');
    }, input.prompt);
    if (!completed) throw new Error(`${requestedMode} Creative Engine pipeline failed validation or execution`);

    const outputAssetIds = steps.flatMap((step) => step.outputAssetId ? [step.outputAssetId] : []);
    const primaryAssetId = [...steps].reverse().find((step) => step.mode === requestedMode && step.outputAssetId)?.outputAssetId ?? outputAssetIds.at(-1);
    if (primaryAssetId) {
      const asset = ProjectManager.getProject().assets.find((candidate) => candidate.id === primaryAssetId);
      if (asset) {
        creativeAssetHandoff.publish({ taskId: context.taskId, assetId: asset.id, assetType: asset.type, mode: requestedMode, name: asset.name });
        eventBus.emit('SWITCH_MODE', requestedMode);
        eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Creative handoff ${asset.id} → ${requestedMode} studio`, mode: requestedMode });
      }
    }

    return {
      mode: requestedMode,
      completed,
      steps: steps.map((step) => ({ id: step.id, mode: step.mode, status: step.status, outputAssetId: step.outputAssetId })),
      outputAssetIds,
      primaryAssetId,
    };
  },
  validateOutput: (output) => output.completed === true && output.outputAssetIds.length > 0 && output.steps.every((step) => step.status === 'completed'),
};
