import { eventBus } from '../core/EventBus';
import { emergencyStop } from '../core/EmergencyStop';
import { ProjectManager } from '../project/ProjectManager';
import { VersionManager } from '../project/VersionManager';
import { ResultValidator, type ValidationResult } from '../security/ResultValidator';
import type { Mio3DScene, MioAnimationProject, MioDrawingDocument, MioGraphicDocument, MioMotionProject, MioMusicProject, MioPhotoDocument, MioSFXPatch } from '../types/creative';
import type { CreativePipelineMode, CreativePipelineRecord, CreativePipelineStepRecord, CreativePipelineValidationSnapshot } from '../types/creativePipeline';

export interface CreativePlanStep {
  id: string;
  mode: CreativePipelineMode;
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
  return { id: step.id, mode: step.mode, action: step.action, assetName: step.assetName, status: step.status === 'pending' ? 'PENDING' : step.status === 'in_progress' ? 'RUNNING' : step.status === 'completed' ? 'COMPLETED' : step.status === 'blocked' ? 'BLOCKED' : 'FAILED', dependsOnStepIds: [...step.dependsOnStepIds], dependsOnAssetIds: [], outputAssetId: step.outputAssetId, validation: step.validation };
}

export class CreativeOrchestrator {
  public static planCreativePipeline(prompt: string): CreativePlanStep[] {
    const lower = prompt.toLowerCase();
    const steps: CreativePlanStep[] = [];
    const needs3D = lower.includes('3d') || lower.includes('robot') || lower.includes('mesh') || lower.includes('model') || lower.includes('spacecraft') || lower.includes('drone');
    const needsMotion2D = lower.includes('motion graphic') || lower.includes('motion design') || lower.includes('2d motion') || lower.includes('kinetic typography') || lower.includes('lower third') || lower.includes('after effects');
    const needsAnim = lower.includes('animat') || lower.includes('walk') || lower.includes('fly') || lower.includes('hover') || (lower.includes('motion') && !needsMotion2D);
    const needsDrawing = lower.includes('draw') || lower.includes('sketch') || lower.includes('illustrat') || lower.includes('paint') || lower.includes('brush') || lower.includes('concept art') || lower.includes('krita') || lower.includes('procreate');
    const needsPhoto = lower.includes('photo') || lower.includes('retouch') || lower.includes('lightroom') || lower.includes('photoshop') || lower.includes('image edit') || lower.includes('color grade');
    const needsSFX = lower.includes('sfx') || lower.includes('sound') || lower.includes('footstep') || lower.includes('laser') || lower.includes('engine') || lower.includes('thruster') || lower.includes('audio');
    const needsMusic = lower.includes('music') || lower.includes('compose') || lower.includes('theme') || lower.includes('melody') || lower.includes('score') || lower.includes('soundtrack');
    const needsGraphic = lower.includes('poster') || lower.includes('graphic') || lower.includes('banner') || lower.includes('design') || lower.includes('logo') || lower.includes('art') || lower.includes('ui');
    const noExplicitCreativeMode = !needs3D && !needsAnim && !needsMotion2D && !needsDrawing && !needsPhoto && !needsSFX && !needsMusic && !needsGraphic;

    if (needs3D || noExplicitCreativeMode) steps.push({ id: 'create_3d', mode: '3D', action: 'Generate validated parametric 3D scene', assetName: 'Cyber_Asset_Model.mio3d', status: 'pending', dependsOnStepIds: [] });
    const threeDId = steps.find((step) => step.mode === '3D')?.id;
    if (needsAnim) steps.push({ id: 'create_animation', mode: 'ANIMATION', action: 'Generate animation bound to the produced 3D object when available', assetName: 'Kinetic_Locomotion.mioanim', status: 'pending', dependsOnStepIds: threeDId ? [threeDId] : [] });
    if (needsDrawing) steps.push({ id: 'create_drawing', mode: 'DRAWING', action: 'Generate validated layered drawing document', assetName: 'Concept_Illustration.miodraw', status: 'pending', dependsOnStepIds: [] });
    if (needsPhoto) steps.push({ id: 'create_photo', mode: 'PHOTO', action: 'Generate validated nondestructive photo-editing document', assetName: 'Photo_Grade.miophoto', status: 'pending', dependsOnStepIds: [] });
    if (needsSFX) steps.push({ id: 'create_sfx', mode: 'SFX', action: 'Generate validated procedural SFX patch', assetName: 'Audio_Synthesized_FX.miosfx', status: 'pending', dependsOnStepIds: threeDId ? [threeDId] : [] });
    if (needsMusic) steps.push({ id: 'create_music', mode: 'MUSIC', action: 'Generate validated multi-track musical theme', assetName: 'Cyberpunk_Score_Suite.miomusic', status: 'pending', dependsOnStepIds: [] });
    if (needsGraphic) steps.push({ id: 'create_graphic', mode: 'GRAPHIC', action: 'Generate validated graphic composition referencing prior pipeline outputs', assetName: 'Technical_Spec_Poster.mioart', status: 'pending', dependsOnStepIds: steps.map((step) => step.id) });
    if (needsMotion2D) {
      const visualDependencies = steps.filter((step) => step.mode === 'GRAPHIC' || step.mode === 'DRAWING' || step.mode === 'PHOTO').map((step) => step.id);
      steps.push({ id: 'create_motion_2d', mode: 'MOTION_2D', action: 'Generate validated 2D motion composition from available visual sources', assetName: 'Motion_Composition.miomotion', status: 'pending', dependsOnStepIds: visualDependencies });
    }
    return steps;
  }

  public static async executePipeline(steps: CreativePlanStep[], onProgress: (stepIdx: number, step: CreativePlanStep) => void, prompt = 'Cross-mode creative project pipeline'): Promise<boolean> {
    const pipelineId = `creative_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const record: CreativePipelineRecord = { id: pipelineId, prompt, status: 'PLANNED', steps: steps.map(toPersistedStep), createdAt: now, updatedAt: now, disclosure: 'Pipeline status records deterministic local prototype generation, dependency linkage, structural validation, and project versioning. It does not imply artistic quality or external-model generation.' };
    persistPipeline(record, `Planned cross-mode creative pipeline ${pipelineId}`);

    const knownStepIds = new Set(record.steps.map((step) => step.id));
    for (let index = 0; index < steps.length; index += 1) {
      const missingDependencyId = steps[index].dependsOnStepIds.find((dependencyId) => !knownStepIds.has(dependencyId));
      if (missingDependencyId) {
        steps[index].status = 'blocked';
        record.steps[index].status = 'BLOCKED';
        record.steps[index].error = `Declared dependency ${missingDependencyId} does not exist in this pipeline`;
        record.steps[index].completedAt = Date.now();
        record.status = 'FAILED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt;
        persistPipeline(record, `Rejected creative pipeline ${pipelineId}: missing dependency ${missingDependencyId}`);
        onProgress(index, steps[index]);
        return false;
      }
    }

    record.status = 'RUNNING'; record.updatedAt = Date.now(); persistPipeline(record);
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const persisted = record.steps[index];
      if (emergencyStop.isEmergencyStopped()) {
        step.status = 'failed'; persisted.status = 'CANCELLED'; persisted.completedAt = Date.now(); persisted.error = 'STOP MIO / Emergency Stop';
        record.status = 'CANCELLED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt; persistPipeline(record, `Cancelled creative pipeline ${pipelineId} by STOP MIO`); onProgress(index, step); return false;
      }
      const dependencies = step.dependsOnStepIds.map((dependencyId) => record.steps.find((candidate) => candidate.id === dependencyId)) as CreativePipelineStepRecord[];
      const incompleteDependency = dependencies.find((dependency) => !dependency || dependency.status !== 'COMPLETED' || !dependency.outputAssetId);
      if (incompleteDependency) {
        const dependencyId = incompleteDependency?.id ?? step.dependsOnStepIds[dependencies.indexOf(incompleteDependency)];
        step.status = 'blocked'; persisted.status = 'BLOCKED'; persisted.error = `Dependency ${dependencyId} is not completed with an output asset`; persisted.completedAt = Date.now();
        record.status = 'FAILED'; record.completedAt = Date.now(); record.updatedAt = record.completedAt; persistPipeline(record, `Blocked creative pipeline ${pipelineId} on dependency ${dependencyId}`); onProgress(index, step); return false;
      }
      persisted.dependsOnAssetIds = dependencies.flatMap((dependency) => dependency.outputAssetId ? [dependency.outputAssetId] : []);
      step.status = 'in_progress'; persisted.status = 'RUNNING'; persisted.startedAt = Date.now(); record.updatedAt = persisted.startedAt;
      eventBus.emit('CORE_STATE_CHANGE', 'CREATING'); persistPipeline(record); onProgress(index, step);
      try {
        const generated = this.generateStep(step, pipelineId, persisted.dependsOnAssetIds, prompt);
        step.validation = validationSnapshot(generated.validation); persisted.validation = step.validation;
        if (!generated.validation.valid) throw new Error(`Validation failed: ${generated.validation.errors.join('; ')}`);
        const asset = ProjectManager.addAsset({ name: step.assetName, type: generated.assetType, origin: 'GENERATED', filePath: `GENERATED/${step.mode}/${step.assetName}`, verified: true, data: { ...generated.data, __mioPipeline: { pipelineId, stepId: step.id, mode: step.mode, dependsOnAssetIds: [...persisted.dependsOnAssetIds], sourcePrompt: prompt, generatedAt: Date.now() } } });
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
    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS'); return true;
  }

  private static generateStep(step: CreativePlanStep, pipelineId: string, dependencyAssetIds: string[], prompt: string): { assetType: '3d' | 'animation' | 'graphic' | 'drawing' | 'photo' | 'motion-2d' | 'sfx' | 'music'; data: Mio3DScene | MioAnimationProject | MioGraphicDocument | MioDrawingDocument | MioPhotoDocument | MioMotionProject | MioSFXPatch | MioMusicProject; validation: ValidationResult } {
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
    if (step.mode === 'DRAWING') {
      const data: MioDrawingDocument = { width: 1200, height: 1200, backgroundColor: '#0a0e17', layers: [{ id: `${pipelineId}_ink`, name: 'Concept Ink', visible: true, locked: false, opacity: 1, strokes: [{ id: `${pipelineId}_stroke_1`, color: '#00f0ff', size: 18, opacity: 0.9, blendMode: 'normal', points: [{ x: 180, y: 780, pressure: 0.4 }, { x: 360, y: 420, pressure: 0.8 }, { x: 600, y: 280, pressure: 1 }, { x: 840, y: 420, pressure: 0.8 }, { x: 1020, y: 780, pressure: 0.4 }] }, { id: `${pipelineId}_stroke_2`, color: '#ffffff', size: 8, opacity: 0.75, blendMode: 'screen', points: [{ x: 300, y: 820, pressure: 0.5 }, { x: 600, y: 620, pressure: 0.9 }, { x: 900, y: 820, pressure: 0.5 }] }] }] };
      return { assetType: 'drawing', data, validation: ResultValidator.validateDrawing(data) };
    }
    if (step.mode === 'PHOTO') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#07111f"/><stop offset="1" stop-color="#116c83"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="920" cy="280" r="150" fill="#8be9fd" opacity=".35"/><text x="80" y="620" fill="#ffffff" font-family="sans-serif" font-size="52">MIO PHOTO SOURCE</text></svg>`;
      const data: MioPhotoDocument = { width: 1280, height: 720, backgroundColor: '#080d16', layers: [{ id: `${pipelineId}_photo`, name: 'Synthetic Source', visible: true, locked: false, opacity: 1, sourceDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, adjustments: { exposure: 0.1, contrast: 0.12, saturation: 0.08, temperature: -0.04, tint: 0.02, grayscale: 0, sepia: 0, blur: 0, vignette: 0.18 } }] };
      return { assetType: 'photo', data, validation: ResultValidator.validatePhoto(data) };
    }
    if (step.mode === 'SFX') {
      const data: MioSFXPatch = { name: 'Cyber_Plasma_Discharge', category: 'LASER', duration: 1.2, layers: [{ id: `${pipelineId}_sfx`, name: 'Transient Attack', type: 'transient', waveType: 'sawtooth', baseFrequency: 880, frequencySweep: 120, attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.4, filterCutoff: 3500, filterResonance: 8, distortion: 0.4, delayTime: 0.1, delayFeedback: 0.3, reverbMix: 0.2, volume: 0.7 }] };
      return { assetType: 'sfx', data, validation: ResultValidator.validateSFX(data) };
    }
    if (step.mode === 'MUSIC') {
      const data: MioMusicProject = { tempo: 128, key: 'A', scale: 'Cyberpunk Aeolian', totalSteps: 64, tracks: [{ id: `${pipelineId}_lead`, name: 'Cyber Lead Synth', role: 'Melody', instrument: 'synth_lead', volume: 0.8, pan: 0, mute: false, solo: false, notes: [{ id: 'n1', pitch: 57, startStep: 0, durationSteps: 4, velocity: 0.9 }, { id: 'n2', pitch: 60, startStep: 4, durationSteps: 4, velocity: 0.85 }, { id: 'n3', pitch: 64, startStep: 8, durationSteps: 8, velocity: 0.95 }] }] };
      return { assetType: 'music', data, validation: ResultValidator.validateMusic(data) };
    }
    if (step.mode === 'MOTION_2D') {
      const linkedNames = dependencyAssets.map((asset) => asset?.name).filter(Boolean).join(' · ');
      const titleId = `${pipelineId}_motion_title`;
      const data: MioMotionProject = { width: 1920, height: 1080, backgroundColor: '#070b12', duration: 5, fps: 30, currentTime: 0, loop: true, layers: [{ id: titleId, name: 'Kinetic Title', type: 'text', visible: true, locked: false, x: 240, y: 420, width: 1440, height: 220, scale: 1, rotation: 0, opacity: 1, fill: '#00f0ff', text: linkedNames ? `MIO MOTION // ${linkedNames}` : `MIO MOTION // ${prompt.slice(0, 48)}`, fontSize: 72, borderRadius: 0 }], tracks: [{ id: `${pipelineId}_motion_x`, nodeId: titleId, property: 'x', keyframes: [{ id: 'kx0', time: 0, value: -600, interpolation: 'easeOut' }, { id: 'kx1', time: 1.2, value: 240, interpolation: 'easeOut' }, { id: 'kx2', time: 4.2, value: 240, interpolation: 'easeIn' }, { id: 'kx3', time: 5, value: 2100, interpolation: 'easeIn' }] }, { id: `${pipelineId}_motion_opacity`, nodeId: titleId, property: 'opacity', keyframes: [{ id: 'ko0', time: 0, value: 0, interpolation: 'linear' }, { id: 'ko1', time: 0.6, value: 1, interpolation: 'easeOut' }, { id: 'ko2', time: 4.5, value: 1, interpolation: 'linear' }, { id: 'ko3', time: 5, value: 0, interpolation: 'easeIn' }] }] };
      return { assetType: 'motion-2d', data, validation: ResultValidator.validateMotion2D(data) };
    }
    const linkedNames = dependencyAssets.map((asset) => asset?.name).filter(Boolean).join(' · ');
    const data: MioGraphicDocument = { width: 800, height: 1000, backgroundColor: '#0a0e17', layers: [{ id: `${pipelineId}_bg`, name: 'Grid Blueprint', type: 'shape', visible: true, locked: true, opacity: 1, x: 0, y: 0, width: 800, height: 1000, fill: '#060910' }, { id: `${pipelineId}_title`, name: 'Header Title', type: 'text', visible: true, locked: false, opacity: 1, x: 40, y: 80, width: 720, height: 80, text: linkedNames ? `MIO CROSS-MODE // ${linkedNames}` : `MIO CROSS-MODE // ${prompt.slice(0, 60)}`, fontSize: 24, fontFamily: 'monospace', fill: '#00f0ff' }] };
    return { assetType: 'graphic', data, validation: ResultValidator.validateGraphic(data) };
  }
}
