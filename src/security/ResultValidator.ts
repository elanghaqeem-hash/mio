import { Mio3DScene, MioAnimationProject, MioGraphicDocument, MioSFXPatch, MioMusicProject } from '../types/creative';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics?: Record<string, any>;
}

export class ResultValidator {
  /**
   * Validates 3D Scene integrity
   */
  public static validate3D(scene: Mio3DScene): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!scene || !Array.isArray(scene.objects)) {
      return { valid: false, errors: ['Invalid 3D scene structure: objects array missing'], warnings: [] };
    }

    if (scene.objects.length === 0) {
      warnings.push('3D scene is empty (0 objects)');
    }

    scene.objects.forEach((obj, idx) => {
      if (!obj.id || !obj.type) {
        errors.push(`Object at index ${idx} is missing required id or type`);
      }
      if (!obj.position || obj.position.length !== 3 || obj.position.some(isNaN)) {
        errors.push(`Object "${obj.name || idx}" has invalid position coordinates`);
      }
      if (!obj.scale || obj.scale.length !== 3 || obj.scale.some(s => isNaN(s) || s <= 0)) {
        errors.push(`Object "${obj.name || idx}" has invalid scale factors`);
      }
    });

    if (!scene.camera || !scene.camera.position) {
      errors.push('3D scene is missing camera configuration');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: { objectCount: scene.objects.length },
    };
  }

  /**
   * Validates Animation data integrity
   */
  public static validateAnimation(anim: MioAnimationProject): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!anim || typeof anim.duration !== 'number' || anim.duration <= 0) {
      errors.push('Animation duration must be a positive number');
    }

    if (!Array.isArray(anim.tracks)) {
      errors.push('Animation tracks must be an array');
    } else {
      anim.tracks.forEach((track) => {
        if (!track.targetObjectId) {
          errors.push(`Animation track "${track.id}" is unlinked to any object ID`);
        }
        track.keyframes.forEach((kf) => {
          if (kf.time < 0 || kf.time > anim.duration) {
            warnings.push(`Keyframe time ${kf.time}s exceeds animation duration ${anim.duration}s`);
          }
        });
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: { trackCount: anim.tracks?.length || 0, duration: anim.duration },
    };
  }

  /**
   * Validates Graphic Art Document integrity
   */
  public static validateGraphic(doc: MioGraphicDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!doc || doc.width <= 0 || doc.height <= 0) {
      errors.push('Document dimensions must be greater than 0');
    }

    if (!Array.isArray(doc.layers)) {
      errors.push('Graphic document layers array is missing');
    } else {
      doc.layers.forEach((layer) => {
        if (!layer.id) errors.push('Layer missing unique identifier');
        if (layer.type === 'text' && (!layer.text || layer.text.trim().length === 0)) {
          warnings.push(`Text layer "${layer.name}" has empty text content`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: { layerCount: doc.layers?.length || 0, dimensions: `${doc.width}x${doc.height}` },
    };
  }

  /**
   * Validates SFX procedural patch
   */
  public static validateSFX(patch: MioSFXPatch): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!patch || !patch.name) errors.push('SFX patch name is required');
    if (!patch.duration || patch.duration <= 0 || patch.duration > 30) {
      errors.push('SFX duration must be between 0.01 and 30.0 seconds');
    }

    if (!Array.isArray(patch.layers) || patch.layers.length === 0) {
      errors.push('SFX patch requires at least one audio synthesis layer');
    } else {
      let totalVolume = 0;
      patch.layers.forEach((layer) => {
        totalVolume += layer.volume;
        if (layer.filterCutoff < 20 || layer.filterCutoff > 22050) {
          warnings.push(`Filter cutoff ${layer.filterCutoff}Hz outside typical audible range`);
        }
      });
      if (totalVolume > 1.8) {
        warnings.push('Combined layer volume is high, risk of audio clipping');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: { layerCount: patch.layers?.length || 0, duration: patch.duration },
    };
  }

  /**
   * Validates Music Studio project
   */
  public static validateMusic(music: MioMusicProject): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!music || music.tempo < 30 || music.tempo > 300) {
      errors.push('Tempo must be between 30 and 300 BPM');
    }

    if (!Array.isArray(music.tracks)) {
      errors.push('Music project tracks array is missing');
    } else {
      let totalNotes = 0;
      music.tracks.forEach((track) => {
        totalNotes += track.notes.length;
        track.notes.forEach((n) => {
          if (n.pitch < 0 || n.pitch > 127) {
            errors.push(`Invalid MIDI pitch ${n.pitch} on track "${track.name}"`);
          }
          if (n.startStep < 0 || n.startStep >= music.totalSteps) {
            errors.push(`Note step ${n.startStep} out of range [0, ${music.totalSteps}]`);
          }
        });
      });
      if (totalNotes === 0) {
        warnings.push('Music composition contains 0 notes');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: { tempo: music.tempo, trackCount: music.tracks?.length || 0 },
    };
  }
}
