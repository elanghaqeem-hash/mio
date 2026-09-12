import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { ProjectManager } from '../project/ProjectManager';
import { VersionManager } from '../project/VersionManager';
import { ResultValidator, type ValidationResult } from '../security/ResultValidator';
import type { Mio3DScene, MioAnimationProject, MioGraphicDocument, MioMusicProject, MioSFXPatch } from '../types/creative';
import type { CreativePipelineRecord, CreativePipelineStepRecord, CreativePipelineValidationSnapshot } from '../types/creativePipeline';

export interface CreativePlanStep {
  id: string;
  mode: '3D' | 'ANIMATION' | 'SFX' | 'MUSIC' | 'GRAPHIC';
  action: string;
  assetName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  dependsOnStepIds: string[];
  outputAssetId?: string;
  validation?: CreativePipelineValidationSnapshot;
}

function validationSnapshot(result: ValidationResult): CreativePipelineValidationSnapshot {
  return { valid: result.valid, errors: [...result.errors], warnings: [...result.warnings], metrics: result.metrics ? { ...result.metrics } : undefined };
}

function persistPipeline(record: CreativePipelineRecord, message?: string): void {
  const project = ProjectManager.getProject();
  project.creativePipelines ??= [];
  const index = project.creativePipelines.findIndex((item) => item.id === record.id);
  const snapshot = { ...record, steps: record.steps.map((step) => ({ ...step, dependsOnStepIds: [...step.dependsOnStepIds], dependsOnAssetIds: [...step.dependsOnAssetIds], validation: step.validation ? { ...step.validation, errors: [...step.validation.errors], warnings: [...step.validation.warnings] } : undefined })) };
  if (index >= 0) project.creativePipelines[index] = snapshot;
  else project.creativePipelines.unshift(snapshot);
  ProjectManager.commitProjectUpdate(message);
}

function toPersistedStep(step: CreativePlanStep): CreativePipelineStepRecord {
  return {
    id: step.id,
    mode: step.mode,
    action: step.action,
    assetName: step.assetName,
    status: step.status === 'pending' ? 'PENDING' : step.status === 'in_progress' ? 'RUNNING' : step.status === 'completed' ? 'COMPLETED' : step.status === 'blocked' ? 'BLOCKED' : 'FAILED',
    dependsOnStepIds: [...step.dependsOnStepIds],
    dependsOnAssetIds: [],
    outputAssetId: step.outputAssetId,
    validation: step.validation,
  };
}

export class CreativeOrchestrator {
  public static planCreativePipeline(prompt: string): CreativePlanStep[] {
    const lower = prompt.toLowerCase();
    const steps: CreativePlanStep[] = [];
    const needs3D = lower.includes('3d') || lower.includes('robot') || lower.includes('mesh') || lower.includes('model') || lower.includes('spacecraft') || lower.includes('drone');
    const needsAnim = lower.includes('animat') || lower.includes('walk') || lower.includes('fly') || lower.includes('hover') || lower.includes('motion');
    const needsSFX = lower.includes('sfx') || lower.includes('sound') || lower.includes('footstep') || lower.includes('laser') || lower.includes('engine') || lower.includes('thruster') || lower.includes('audio');
    const needsMusic = lower.includes('music') || lower.includes('compose') || lower.includes('theme') || lower.includes('melody') || lower.includes('score') || lower.includes('soundtrack');
    const needsGraphic = lower.includes('poster') || lower.includes('graphic') || lower.includes('banner') || lower.includes('design') || lower.includes('art') || lower.includes('ui');

    if (needs3D || (!needsAnim && !needsSFX && !needsMusic && !needsGraphic)) steps.push({ id: 'create_3d', mode: '3D', action: 'Generate validated parametric 3D scene', assetName: 'Cyber_Asset_Model.mio3d', status: 'pending', dependsOnStepIds: [] });
    const threeDId = steps.find((step) => step.mode === '3D')?.id;
    if (needsAnim) steps.push({ id: 'create_animation', mode: 'ANIMATION', action: 'Generate animation bound to the produced 3D object when available', assetName: 'Kinetic_Locomotion.mioanim', status: 'pending', dependsOnStepIds: threeDId ? [threeDId] : [] });
    if (needsSFX) steps.push({ id: 'create_sfx', mode: 'SFX', action: 'Generate validated procedural SFX patch', assetName: 'Audio_Synthesized_FX.miosfx', status: 'pending', dependsOnStepIds: threeDId ? [threeDId] : [] });
    if (needsMusic) steps.push({ id: 'create_music', mode: 'MUSIC', action: 'Generate validated multi-track musical theme', assetName: 'Cyberpunk_Score_Suite.miomusic', status: 'pending', dependsOnStepIds: [] });
    if (needsGraphic) steps.push({ id: 'create_graphic', mode: 'GRAPHIC', action: 'Generate validated graphic composition referencing prior pipeline outputs', assetName: 'Technical_Spec_Poster.mioart', status: 'pending', dependsOnStepIds: steps.map((step) => step.id) });
    return steps;
  }

  public static async executePipeline(steps: CreativePlanStep[], onProgress: (stepIdx: number, step: CreativePlanStep) => void, prompt = 'Cross-mode creative project pipeline'): Promise<boolean> {
    const pipelineId = `creative_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const record: CreativePipelineRecord = {
      id: pipelineId,
      prompt,
      status: 'PLANNED',
      steps: steps.map(toPersistedStep),
      createdAt: now,
      updatedAt: now,
      disclosure: 'Pipeline status records deterministic local prototype generation, dependency linkage, structural validation, and project versioning. It does not imply artistic quality or external-model generation.',
    };
    persistPipeline(record, `Planned cross-mode creative pipeline ${pipelineId}`);
    record.status = 'RUNNING'; record.updatedAt = Date.now(); persistPipeline(record);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const persisted = record.steps[index];
      if (emergencyStop.isEmergencyStopped()) {
        step.status = 'failed'; persisted.status = 'CANCELLED'; persisted.completedAt = Date.now(); persisted.error = 'STOP MIO / Emergency Stop';
        record.status = 'CANCELLED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt; persistPipeline(record, `Cancelled creative pipeline ${pipelineId} by STOP MIO`); onProgress(index, step); return false;
      }

      const dependencies = step.dependsOnStepIds.map((dependencyId) => record.steps.find((candidate) => candidate.id === dependencyId)).filter(Boolean) as CreativePipelineStepRecord[];
      const incompleteDependency = dependencies.find((dependency) => dependency.status !== 'COMPLETED' || !dependency.outputAssetId);
      if (incompleteDependency) {
        step.status = 'blocked'; persisted.status = 'BLOCKED'; persisted.error = `Dependency ${incompleteDependency.id} is not completed with an output asset`; persisted.completedAt = Date.now();
        record.status = 'FAILED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt; persistPipeline(record, `Blocked creative pipeline ${pipelineId} on dependency ${incompleteDependency.id}`); onProgress(index, step); return false;
      }

      persisted.dependsOnAssetIds = dependencies.flatMap((dependency) => dependency.outputAssetId ? [dependency.outputAssetId] : []);
      step.status = 'in_progress'; persisted.status = 'RUNNING'; persisted.startedAt = Date.now(); record.updatedAt = persisted.startedAt;
      eventBus.emit('CORE_STATE_CHANGE', 'CREATING'); persistPipeline(record); onProgress(index, step);

      try {
        const generated = this.generateStep(step, pipelineId, persisted.dependsOnAssetIds, prompt);
        step.validation = validationSnapshot(generated.validation); persisted.validation = step.validation;
        if (!generated.validation.valid) throw new Error(`Validation failed: ${generated.validation.errors.join('; ')}`);

        const asset = ProjectManager.addAsset({
          name: step.assetName,
          type: generated.assetType,
          origin: 'GENERATED',
          filePath: `GENERATED/${step.mode}/${step.assetName}`,
          verified: true,
          data: {
            ...generated.data,
            __mioPipeline: {
              pipelineId,
              stepId: step.id,
              mode: step.mode,
              dependsOnAssetIds: [...persisted.dependsOnAssetIds],
              sourcePrompt: prompt,
              generatedAt: Date.now(),
            },
          },
        });
        step.outputAssetId = asset.id; persisted.outputAssetId = asset.id; step.status = 'completed'; persisted.status = 'COMPLETED'; persisted.completedAt = Date.now(); record.updatedAt = persisted.completedAt;
        persistPipeline(record, `Completed creative pipeline step ${step.id} → ${asset.id}`); onProgress(index, step);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        step.status = 'failed'; persisted.status = 'FAILED'; persisted.error = message; persisted.completedAt = Date.now(); record.status = 'FAILED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt;
        persistPipeline(record, `Failed creative pipeline step ${step.id}: ${message}`); eventBus.emit('CORE_STATE_CHANGE', 'ERROR'); onProgress(index, step); return false;
      }
    }

    record.status = 'COMPLETED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt; persistPipeline(record, `Completed cross-mode creative pipeline ${pipelineId}`);
    VersionManager.takeSnapshot(`Cross-mode creative pipeline ${pipelineId}`);
    record.snapshotVersionId = ProjectManager.getProject().versions[0]?.versionId; record.updatedAt = Date.now(); persistPipeline(record);
    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    return true;
  }

  private static generateStep(step: CreativePlanStep, pipelineId: string, dependencyAssetIds: string[], prompt: string): { assetType: '3d' | 'animation' | 'graphic' | 'sfx' | 'music'; data: Mio3DScene | MioAnimationProject | MioGraphicDocument | MioSFXPatch | MioMusicProject; validation: ValidationResult } {
    const dependencyAssets = dependencyAssetIds.map((assetId) => ProjectManager.getProject().assets.find((asset) => asset.id === assetId)).filter(Boolean);
    if (step.mode === '3D') {
      const data: Mio3DScene = { objects: [{ id: `${pipelineId}_root`, name: 'Procedural_Cyber_Vessel', type: 'mech_core', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1.2, 1.2, 1.2], color: '#00f0ff', metalness: 0.8, roughness: 0.2, wireframe: false }], camera: { position: [0, 2, 5], fov: 60 }, lights: { ambientColor: '#101525', ambientIntensity: 1, directionalColor: '#00f0ff', directionalIntensity: 1.5 } };
      return { assetType: '3d', data, validation: ResultValidator.validate3D(data) };
    }
    if (step.mode === 'ANIMATION') {
      const source3D = dependencyAssets.find((asset) => asset?.type === '3d');
      const targetObjectId = source3D?.data?.objects?.[0]?.id ?? `${pipelineId}_standalone_target`;
      const data: MioAnimationProject = { duration: 4, fps: 60, tracks: [{ id: `${pipelineId}_motion`, targetObjectId, property: 'position.y', keyframes: [{ time: 0, value: 0, interpolation: 'easeInOut' }, { time: 2, value: 0.8, interpolation: 'easeInOut' }, { time: 4, value: 0, interpolation: 'easeInOut' }] }], currentTime: 0, loop: true };
      return { assetType: 'animation', data, validation: ResultValidator.validateAnimation(data) };
    }
    if (step.mode === 'SFX') {
      const data: MioSFXPatch = { name: 'Cyber_Plasma_Discharge', category: 'LASER', duration: 1.2, layers: [{ id: `${pipelineId}_sfx`, name: 'Transient Attack', type: 'transient', waveType: 'sawtooth', baseFrequency: 880, frequencySweep: 120, attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.4, filterCutoff: 3500, filterResonance: 8, distortion: 0.4, delayTime: 0.1, delayFeedback: 0.3, reverbMix: 0.2, volume: 0.7 }] };
      return { assetType: 'sfx', data, validation: ResultValidator.validateSFX(data) };
    }
    if (step.mode === 'MUSIC') {
      const data: MioMusicProject = { tempo: 128, key: 'A', scale: 'Cyberpunk Aeolian', totalSteps: 64, tracks: [{ id: `${pipelineId}_lead`, name: 'Cyber Lead Synth', role: 'Melody', instrument: 'synth_lead', volume: 0.8, pan: 0, mute: false, solo: false, notes: [{ id: 'n1', pitch: 57, startStep: 0, durationSteps: 4, velocity: 0.9 }, { id: 'n2', pitch: 60, startStep: 4, durationSteps: 4, velocity: 0.85 }, { id: 'n3', pitch: 64, startStep: 8, durationSteps: 8, velocity: 0.95 }] }] };
      return { assetType: 'music', data, validation: ResultValidator.validateMusic(data) };
    }
    const linkedNames = dependencyAssets.map((asset) => asset?.name).filter(Boolean).join(' · ');
    const data: MioGraphicDocument = { width: 800, height: 1000, backgroundColor: '#0a0e17', layers: [{ id: `${pipelineId}_bg`, name: 'Grid Blueprint', type: 'shape', visible: true, locked: true, opacity: 1, x: 0, y: 0, width: 800, height: 1000, fill: '#060910' }, { id: `${pipelineId}_title`, name: 'Header Title', type: 'text', visible: true, locked: false, opacity: 1, x: 40, y: 80, width: 720, height: 80, text: linkedNames ? `MIO CROSS-MODE // ${linkedNames}` : `MIO CROSS-MODE // ${prompt.slice(0, 60)}`, fontSize: 24, fontFamily: 'monospace', fill: '#00f0ff' }] };
    return { assetType: 'graphic', data, validation: ResultValidator.validateGraphic(data) };
  }
}
