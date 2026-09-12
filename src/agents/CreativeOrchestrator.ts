import { eventBus } from '../core/EventBus';
import { ProjectManager } from '../project/ProjectManager';
import { ResultValidator } from '../security/ResultValidator';
import { emergencyStop } from '../core/EmergencyStop';

export interface CreativePlanStep {
  mode: '3D' | 'ANIMATION' | 'SFX' | 'MUSIC' | 'GRAPHIC';
  action: string;
  assetName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export class CreativeOrchestrator {
  /**
   * Decomposes creative requests into a multi-mode pipeline
   */
  public static planCreativePipeline(prompt: string): CreativePlanStep[] {
    const steps: CreativePlanStep[] = [];
    const lower = prompt.toLowerCase();

    const needs3D = lower.includes('3d') || lower.includes('robot') || lower.includes('mesh') || lower.includes('model') || lower.includes('spacecraft') || lower.includes('drone');
    const needsAnim = lower.includes('animat') || lower.includes('walk') || lower.includes('fly') || lower.includes('hover') || lower.includes('motion');
    const needsSFX = lower.includes('sfx') || lower.includes('sound') || lower.includes('footstep') || lower.includes('laser') || lower.includes('engine') || lower.includes('thruster') || lower.includes('audio');
    const needsMusic = lower.includes('music') || lower.includes('compose') || lower.includes('theme') || lower.includes('melody') || lower.includes('score') || lower.includes('soundtrack');
    const needsGraphic = lower.includes('poster') || lower.includes('graphic') || lower.includes('banner') || lower.includes('design') || lower.includes('art') || lower.includes('ui');

    if (needs3D || (!needsAnim && !needsSFX && !needsMusic && !needsGraphic)) {
      steps.push({
        mode: '3D',
        action: 'Generate parametric 3D Mesh geometry and materials',
        assetName: 'Cyber_Asset_Model.mio3d',
        status: 'pending',
      });
    }

    if (needsAnim) {
      steps.push({
        mode: 'ANIMATION',
        action: 'Bind motion tracks and generate keyframe trajectory',
        assetName: 'Kinetic_Locomotion.mioanim',
        status: 'pending',
      });
    }

    if (needsSFX) {
      steps.push({
        mode: 'SFX',
        action: 'Synthesize procedural multi-layer audio sound effect',
        assetName: 'Audio_Synthesized_FX.miosfx',
        status: 'pending',
      });
    }

    if (needsMusic) {
      steps.push({
        mode: 'MUSIC',
        action: 'Compose multi-track musical theme and piano roll sequence',
        assetName: 'Cyberpunk_Score_Suite.miomusic',
        status: 'pending',
      });
    }

    if (needsGraphic) {
      steps.push({
        mode: 'GRAPHIC',
        action: 'Design composite vector poster and technical layout',
        assetName: 'Technical_Spec_Poster.mioart',
        status: 'pending',
      });
    }

    return steps;
  }

  /**
   * Executes the multi-mode pipeline with security checks, validation, and STOP MIO sensitivity
   */
  public static async executePipeline(
    steps: CreativePlanStep[],
    onProgress: (stepIdx: number, step: CreativePlanStep) => void
  ): Promise<boolean> {
    for (let i = 0; i < steps.length; i++) {
      if (emergencyStop.isEmergencyStopped()) {
        steps[i].status = 'failed';
        eventBus.emit('ACTIVITY_LOG', {
          timestamp: Date.now(),
          message: 'Pipeline aborted by Emergency Stop',
          mode: steps[i].mode as any,
        });
        return false;
      }

      const step = steps[i];
      step.status = 'in_progress';
      eventBus.emit('CORE_STATE_CHANGE', `${step.mode} MODE` as any);
      onProgress(i, step);

      // Simulate generation delay
      await new Promise((r) => setTimeout(r, 700));

      if (emergencyStop.isEmergencyStopped()) {
        step.status = 'failed';
        return false;
      }

      // Generate corresponding asset data and save to project
      if (step.mode === '3D') {
        const dummyScene = {
          objects: [
            {
              id: 'obj_' + Date.now(),
              name: 'Procedural_Cyber_Vessel',
              type: 'mech_core' as const,
              position: [0, 0, 0] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [1.2, 1.2, 1.2] as [number, number, number],
              color: '#00f0ff',
              metalness: 0.8,
              roughness: 0.2,
              wireframe: false,
            },
          ],
          camera: { position: [0, 2, 5] as [number, number, number], fov: 60 },
          lights: { ambientColor: '#101525', ambientIntensity: 1.0, directionalColor: '#00f0ff', directionalIntensity: 1.5 },
        };
        ResultValidator.validate3D(dummyScene);
        ProjectManager.addAsset({
          name: step.assetName,
          type: '3d',
          origin: 'GENERATED',
          filePath: `GENERATED/3D/${step.assetName}`,
          verified: true,
          data: dummyScene,
        });
      } else if (step.mode === 'ANIMATION') {
        const dummyAnim = {
          duration: 4.0,
          fps: 60,
          tracks: [
            {
              id: 'track_1',
              targetObjectId: 'obj_root',
              property: 'position.y' as const,
              keyframes: [
                { time: 0, value: 0, interpolation: 'easeInOut' as const },
                { time: 2, value: 0.8, interpolation: 'easeInOut' as const },
                { time: 4, value: 0, interpolation: 'easeInOut' as const },
              ],
            },
          ],
          currentTime: 0,
          loop: true,
        };
        ResultValidator.validateAnimation(dummyAnim);
        ProjectManager.addAsset({
          name: step.assetName,
          type: 'animation',
          origin: 'GENERATED',
          filePath: `GENERATED/ANIMATION/${step.assetName}`,
          verified: true,
          data: dummyAnim,
        });
      } else if (step.mode === 'SFX') {
        const dummyPatch = {
          name: 'Cyber_Plasma_Discharge',
          category: 'LASER' as const,
          duration: 1.2,
          layers: [
            {
              id: 'layer_1',
              name: 'Transient Attack',
              type: 'transient' as const,
              waveType: 'sawtooth' as OscillatorType,
              baseFrequency: 880,
              frequencySweep: 120,
              attack: 0.01,
              decay: 0.2,
              sustain: 0.1,
              release: 0.4,
              filterCutoff: 3500,
              filterResonance: 8,
              distortion: 0.4,
              delayTime: 0.1,
              delayFeedback: 0.3,
              reverbMix: 0.2,
              volume: 0.7,
            },
          ],
        };
        ResultValidator.validateSFX(dummyPatch);
        ProjectManager.addAsset({
          name: step.assetName,
          type: 'sfx',
          origin: 'GENERATED',
          filePath: `GENERATED/SFX/${step.assetName}`,
          verified: true,
          data: dummyPatch,
        });
      } else if (step.mode === 'MUSIC') {
        const dummyMusic = {
          tempo: 128,
          key: 'A',
          scale: 'Cyberpunk Aeolian' as const,
          totalSteps: 64,
          tracks: [
            {
              id: 'trk_lead',
              name: 'Cyber Lead Synth',
              role: 'Melody' as const,
              instrument: 'synth_lead' as const,
              volume: 0.8,
              pan: 0,
              mute: false,
              solo: false,
              notes: [
                { id: 'n1', pitch: 57, startStep: 0, durationSteps: 4, velocity: 0.9 },
                { id: 'n2', pitch: 60, startStep: 4, durationSteps: 4, velocity: 0.85 },
                { id: 'n3', pitch: 64, startStep: 8, durationSteps: 8, velocity: 0.95 },
                { id: 'n4', pitch: 62, startStep: 16, durationSteps: 4, velocity: 0.8 },
              ],
            },
          ],
        };
        ResultValidator.validateMusic(dummyMusic);
        ProjectManager.addAsset({
          name: step.assetName,
          type: 'music',
          origin: 'GENERATED',
          filePath: `GENERATED/MUSIC/${step.assetName}`,
          verified: true,
          data: dummyMusic,
        });
      } else if (step.mode === 'GRAPHIC') {
        const dummyDoc = {
          width: 800,
          height: 1000,
          backgroundColor: '#0a0e17',
          layers: [
            {
              id: 'layer_bg',
              name: 'Grid Blueprint',
              type: 'shape' as const,
              visible: true,
              locked: true,
              opacity: 1,
              x: 0,
              y: 0,
              width: 800,
              height: 1000,
              fill: '#060910',
            },
            {
              id: 'layer_title',
              name: 'Header Title',
              type: 'text' as const,
              visible: true,
              locked: false,
              opacity: 1,
              x: 40,
              y: 80,
              width: 720,
              height: 60,
              text: 'VANGUARD INITIATIVE // MIO V2',
              fontSize: 28,
              fontFamily: 'monospace',
              fill: '#00f0ff',
            },
          ],
        };
        ResultValidator.validateGraphic(dummyDoc);
        ProjectManager.addAsset({
          name: step.assetName,
          type: 'graphic',
          origin: 'GENERATED',
          filePath: `GENERATED/GRAPHIC/${step.assetName}`,
          verified: true,
          data: dummyDoc,
        });
      }

      step.status = 'completed';
      onProgress(i, step);
    }

    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    setTimeout(() => {
      if (!emergencyStop.isEmergencyStopped()) {
        eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
      }
    }, 2000);

    return true;
  }
}
