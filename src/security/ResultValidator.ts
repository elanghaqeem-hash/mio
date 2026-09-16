import { Mio3DScene, MioAnimationProject, MioDrawingDocument, MioGraphicDocument, MioMotionProject, MioMusicProject, MioPhotoDocument, MioSFXPatch } from '../types/creative';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics?: Record<string, any>;
}

export class ResultValidator {
  public static validate3D(scene: Mio3DScene): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!scene || !Array.isArray(scene.objects)) return { valid: false, errors: ['Invalid 3D scene structure: objects array missing'], warnings: [] };
    if (scene.objects.length === 0) warnings.push('3D scene is empty (0 objects)');
    scene.objects.forEach((obj, idx) => {
      if (!obj.id || !obj.type) errors.push(`Object at index ${idx} is missing required id or type`);
      if (!obj.position || obj.position.length !== 3 || obj.position.some(isNaN)) errors.push(`Object "${obj.name || idx}" has invalid position coordinates`);
      if (!obj.scale || obj.scale.length !== 3 || obj.scale.some((s) => isNaN(s) || s <= 0)) errors.push(`Object "${obj.name || idx}" has invalid scale factors`);
    });
    if (!scene.camera || !scene.camera.position) errors.push('3D scene is missing camera configuration');
    return { valid: errors.length === 0, errors, warnings, metrics: { objectCount: scene.objects.length } };
  }

  public static validateAnimation(anim: MioAnimationProject): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!anim || typeof anim.duration !== 'number' || anim.duration <= 0) errors.push('Animation duration must be a positive number');
    if (!Array.isArray(anim.tracks)) errors.push('Animation tracks must be an array');
    else anim.tracks.forEach((track) => {
      if (!track.targetObjectId) errors.push(`Animation track "${track.id}" is unlinked to any object ID`);
      track.keyframes.forEach((kf) => { if (kf.time < 0 || kf.time > anim.duration) warnings.push(`Keyframe time ${kf.time}s exceeds animation duration ${anim.duration}s`); });
    });
    return { valid: errors.length === 0, errors, warnings, metrics: { trackCount: anim.tracks?.length || 0, duration: anim.duration } };
  }

  public static validateGraphic(doc: MioGraphicDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!doc || doc.width <= 0 || doc.height <= 0) errors.push('Document dimensions must be greater than 0');
    if (!Array.isArray(doc.layers)) errors.push('Graphic document layers array is missing');
    else doc.layers.forEach((layer) => {
      if (!layer.id) errors.push('Layer missing unique identifier');
      if (layer.type === 'text' && (!layer.text || layer.text.trim().length === 0)) warnings.push(`Text layer "${layer.name}" has empty text content`);
    });
    return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: doc.layers?.length || 0, dimensions: `${doc.width}x${doc.height}` } };
  }

  public static validateDrawing(doc: MioDrawingDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!doc || doc.width <= 0 || doc.height <= 0) errors.push('Drawing dimensions must be greater than 0');
    if (!Array.isArray(doc.layers)) errors.push('Drawing layers array is missing');
    else {
      let strokeCount = 0;
      let pointCount = 0;
      doc.layers.forEach((layer) => {
        if (!layer.id) errors.push('Drawing layer missing unique identifier');
        if (layer.opacity < 0 || layer.opacity > 1) errors.push(`Drawing layer "${layer.name}" opacity must be between 0 and 1`);
        if (!Array.isArray(layer.strokes)) errors.push(`Drawing layer "${layer.name}" strokes array is missing`);
        else layer.strokes.forEach((stroke) => {
          strokeCount += 1;
          if (!stroke.id || stroke.size <= 0) errors.push(`Drawing stroke on "${layer.name}" has invalid id or brush size`);
          if (stroke.opacity < 0 || stroke.opacity > 1) errors.push(`Drawing stroke "${stroke.id}" opacity must be between 0 and 1`);
          if (!Array.isArray(stroke.points) || stroke.points.length < 2) warnings.push(`Drawing stroke "${stroke.id}" has fewer than two points`);
          else stroke.points.forEach((point) => {
            pointCount += 1;
            if (![point.x, point.y, point.pressure].every(Number.isFinite)) errors.push(`Drawing stroke "${stroke.id}" contains non-finite point data`);
            if (point.pressure < 0 || point.pressure > 1) warnings.push(`Drawing stroke "${stroke.id}" contains pressure outside 0..1`);
          });
        });
      });
      if (strokeCount === 0) warnings.push('Drawing contains 0 strokes');
      return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: doc.layers.length, strokeCount, pointCount, dimensions: `${doc.width}x${doc.height}` } };
    }
    return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: 0 } };
  }

  public static validatePhoto(doc: MioPhotoDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!doc || doc.width <= 0 || doc.height <= 0) errors.push('Photo document dimensions must be greater than 0');
    if (!Array.isArray(doc.layers)) errors.push('Photo document layers array is missing');
    else {
      let sourceLayers = 0;
      doc.layers.forEach((layer) => {
        if (!layer.id) errors.push('Photo layer missing unique identifier');
        if (layer.opacity < 0 || layer.opacity > 1) errors.push(`Photo layer "${layer.name}" opacity must be between 0 and 1`);
        if (layer.sourceDataUrl) sourceLayers += 1;
        const values = Object.values(layer.adjustments);
        if (!values.every((value) => Number.isFinite(value))) errors.push(`Photo layer "${layer.name}" contains invalid adjustment values`);
      });
      if (sourceLayers === 0) warnings.push('Photo document has no embedded raster source; it behaves as an adjustment recipe only');
      return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: doc.layers.length, sourceLayers, dimensions: `${doc.width}x${doc.height}` } };
    }
    return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: 0 } };
  }

  public static validateMotion2D(project: MioMotionProject): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!project || project.width <= 0 || project.height <= 0) errors.push('Motion composition dimensions must be greater than 0');
    if (!project || project.duration <= 0) errors.push('Motion composition duration must be greater than 0');
    if (!project || project.fps <= 0) errors.push('Motion composition FPS must be greater than 0');
    if (!Array.isArray(project.layers)) errors.push('Motion layers array is missing');
    if (!Array.isArray(project.tracks)) errors.push('Motion tracks array is missing');
    if (Array.isArray(project.layers) && Array.isArray(project.tracks)) {
      const nodeIds = new Set(project.layers.map((layer) => layer.id));
      project.tracks.forEach((track) => {
        if (!nodeIds.has(track.nodeId)) errors.push(`Motion track "${track.id}" targets missing layer ${track.nodeId}`);
        track.keyframes.forEach((keyframe) => {
          if (keyframe.time < 0 || keyframe.time > project.duration) warnings.push(`Motion keyframe ${keyframe.id} lies outside the composition duration`);
          if (!Number.isFinite(keyframe.value)) errors.push(`Motion keyframe ${keyframe.id} contains a non-finite value`);
        });
      });
    }
    return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: project.layers?.length || 0, trackCount: project.tracks?.length || 0, duration: project.duration, fps: project.fps } };
  }

  public static validateSFX(patch: MioSFXPatch): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!patch || !patch.name) errors.push('SFX patch name is required');
    if (!patch.duration || patch.duration <= 0 || patch.duration > 30) errors.push('SFX duration must be between 0.01 and 30.0 seconds');
    if (!Array.isArray(patch.layers) || patch.layers.length === 0) errors.push('SFX patch requires at least one audio synthesis layer');
    else {
      let totalVolume = 0;
      patch.layers.forEach((layer) => {
        totalVolume += layer.volume;
        if (layer.filterCutoff < 20 || layer.filterCutoff > 22050) warnings.push(`Filter cutoff ${layer.filterCutoff}Hz outside typical audible range`);
      });
      if (totalVolume > 1.8) warnings.push('Combined layer volume is high, risk of audio clipping');
    }
    return { valid: errors.length === 0, errors, warnings, metrics: { layerCount: patch.layers?.length || 0, duration: patch.duration } };
  }

  public static validateMusic(music: MioMusicProject): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!music || music.tempo < 30 || music.tempo > 300) errors.push('Tempo must be between 30 and 300 BPM');
    if (!Array.isArray(music.tracks)) errors.push('Music project tracks array is missing');
    else {
      let totalNotes = 0;
      music.tracks.forEach((track) => {
        totalNotes += track.notes.length;
        track.notes.forEach((note) => {
          if (note.pitch < 0 || note.pitch > 127) errors.push(`Invalid MIDI pitch ${note.pitch} on track "${track.name}"`);
          if (note.startStep < 0 || note.startStep >= music.totalSteps) errors.push(`Note step ${note.startStep} out of range [0, ${music.totalSteps}]`);
        });
      });
      if (totalNotes === 0) warnings.push('Music composition contains 0 notes');
    }
    return { valid: errors.length === 0, errors, warnings, metrics: { tempo: music.tempo, trackCount: music.tracks?.length || 0 } };
  }
}
