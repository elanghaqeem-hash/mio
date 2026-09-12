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
  public static planCreativePipeline(prompt: string): CreativePlanStep[] {
    const steps: CreativePlanStep[] = [];
    const lower = prompt.toLowerCase();
    const needs3D = /3d|robot|mesh|model|spacecraft|drone/.test(lower);
    const needsAnim = /animat|walk|fly|hover|motion/.test(lower);
    const needsSFX = /sfx|sound|footstep|laser|engine|thruster|audio/.test(lower);
    const needsMusic = /music|compose|theme|melody|score|soundtrack/.test(lower);
    const needsGraphic = /poster|graphic|banner|design|art|ui/.test(lower);

    if (needs3D) steps.push({ mode:'3D', action:'Generate local parametric 3D geometry', assetName:'Procedural_Model.mio3d', status:'pending' });
    if (needsAnim) steps.push({ mode:'ANIMATION', action:'Generate local keyframe trajectory', assetName:'Procedural_Animation.mioanim', status:'pending' });
    if (needsSFX) steps.push({ mode:'SFX', action:'Generate local procedural audio patch', assetName:'Procedural_SFX.miosfx', status:'pending' });
    if (needsMusic) steps.push({ mode:'MUSIC', action:'Generate local MIDI-style composition', assetName:'Procedural_Music.miomusic', status:'pending' });
    if (needsGraphic) steps.push({ mode:'GRAPHIC', action:'Generate local vector composition', assetName:'Procedural_Graphic.mioart', status:'pending' });
    return steps;
  }

  public static async executePipeline(steps: CreativePlanStep[], onProgress: (stepIdx: number, step: CreativePlanStep) => void): Promise<boolean> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (emergencyStop.isEmergencyStopped()) { step.status = 'failed'; onProgress(i, step); return false; }
      step.status = 'in_progress'; onProgress(i, step); eventBus.emit('CORE_STATE_CHANGE', `${step.mode} MODE` as any);

      let validation: { valid: boolean; errors: string[] };
      if (step.mode === '3D') {
        const generated = {
          objects:[{ id:`obj_${crypto.randomUUID()}`, name:'Procedural_Object', type:'cube' as const, position:[0,0,0] as [number,number,number], rotation:[0,0,0] as [number,number,number], scale:[1,1,1] as [number,number,number], color:'#00f0ff', metalness:0.7, roughness:0.3, wireframe:false }],
          camera:{ position:[0,2,5] as [number,number,number], fov:60 },
          lights:{ ambientColor:'#101525', ambientIntensity:1, directionalColor:'#00f0ff', directionalIntensity:1.5 },
        };
        validation = ResultValidator.validate3D(generated);
        if (validation.valid) ProjectManager.addAsset({ name:step.assetName, type:'3d', origin:'GENERATED', filePath:`GENERATED/3D/${step.assetName}`, verified:true, data:generated });
      } else if (step.mode === 'ANIMATION') {
        const generated = { duration:4, fps:60, tracks:[{ id:`track_${crypto.randomUUID()}`, targetObjectId:'obj_root', property:'position.y' as const, keyframes:[{time:0,value:0,interpolation:'easeInOut' as const},{time:2,value:0.8,interpolation:'easeInOut' as const},{time:4,value:0,interpolation:'easeInOut' as const}] }], currentTime:0, loop:true };
        validation = ResultValidator.validateAnimation(generated);
        if (validation.valid) ProjectManager.addAsset({ name:step.assetName, type:'animation', origin:'GENERATED', filePath:`GENERATED/ANIMATION/${step.assetName}`, verified:true, data:generated });
      } else if (step.mode === 'SFX') {
        const generated = { name:'Procedural Effect', category:'LASER' as const, duration:1.2, layers:[{ id:`layer_${crypto.randomUUID()}`, name:'Synth Layer', type:'transient' as const, waveType:'sawtooth' as OscillatorType, baseFrequency:880, frequencySweep:120, attack:0.01, decay:0.2, sustain:0.1, release:0.4, filterCutoff:3500, filterResonance:8, distortion:0.4, delayTime:0.1, delayFeedback:0.3, reverbMix:0.2, volume:0.7 }] };
        validation = ResultValidator.validateSFX(generated);
        if (validation.valid) ProjectManager.addAsset({ name:step.assetName, type:'sfx', origin:'GENERATED', filePath:`GENERATED/SFX/${step.assetName}`, verified:true, data:generated });
      } else if (step.mode === 'MUSIC') {
        const generated = { tempo:120, key:'A', scale:'Cyberpunk Aeolian' as const, totalSteps:32, tracks:[{ id:`trk_${crypto.randomUUID()}`, name:'Procedural Lead', role:'Melody' as const, instrument:'synth_lead' as const, volume:0.8, pan:0, mute:false, solo:false, notes:[{id:'n1',pitch:57,startStep:0,durationSteps:4,velocity:0.9},{id:'n2',pitch:60,startStep:4,durationSteps:4,velocity:0.85},{id:'n3',pitch:64,startStep:8,durationSteps:8,velocity:0.95}] }] };
        validation = ResultValidator.validateMusic(generated);
        if (validation.valid) ProjectManager.addAsset({ name:step.assetName, type:'music', origin:'GENERATED', filePath:`GENERATED/MUSIC/${step.assetName}`, verified:true, data:generated });
      } else {
        const generated = { width:800, height:1000, backgroundColor:'#0a0e17', layers:[{ id:`layer_${crypto.randomUUID()}`, name:'Background', type:'shape' as const, visible:true, locked:true, opacity:1, x:0, y:0, width:800, height:1000, fill:'#060910' },{ id:`layer_${crypto.randomUUID()}`, name:'Title', type:'text' as const, visible:true, locked:false, opacity:1, x:40, y:80, width:720, height:60, text:'MIO PROCEDURAL DESIGN', fontSize:28, fontFamily:'monospace', fill:'#00f0ff' }] };
        validation = ResultValidator.validateGraphic(generated);
        if (validation.valid) ProjectManager.addAsset({ name:step.assetName, type:'graphic', origin:'GENERATED', filePath:`GENERATED/GRAPHIC/${step.assetName}`, verified:true, data:generated });
      }

      if (!validation.valid) {
        step.status = 'failed'; onProgress(i, step);
        eventBus.emit('SECURITY_EVENT', { id:crypto.randomUUID(), timestamp:Date.now(), level:'warning', category:'OUTPUT_VALIDATION', action:'PROCEDURAL_OUTPUT_REJECTED', details:`${step.mode} output rejected: ${validation.errors.join('; ')}`, blocked:true });
        return false;
      }
      step.status = 'completed'; onProgress(i, step);
    }
    eventBus.emit('CORE_STATE_CHANGE', 'SUCCESS');
    queueMicrotask(() => { if (!emergencyStop.isEmergencyStopped()) eventBus.emit('CORE_STATE_CHANGE', 'IDLE'); });
    return true;
  }
}
