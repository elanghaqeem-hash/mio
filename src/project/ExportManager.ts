import { ResultValidator } from '../security/ResultValidator';
import { PermissionEngine } from '../security/PermissionEngine';
import { eventBus } from '../core/EventBus';
import type { MioSystemMode } from '../types/core';
import type { Mio3DScene } from '../types/creative';
import { analyzeMioSceneExchange, exportMioSceneToGlb, exportMioSceneToGltf, serializeMioSceneAsObj } from '../modes/studio3d/modeling/MeshGltfExchange';

export class ExportManager {
  /**
   * Safe browser download of file blobs
   */
  private static triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Authoritative 3D Wavefront OBJ export.
   * V5.9 deliberately refuses placeholder geometry when MioMeshData is absent.
   */
  public static async export3DAsObj(sceneData: Mio3DScene, filename: string = 'model.obj'): Promise<boolean> {
    const validation = ResultValidator.validate3D(sceneData);
    const exchange = analyzeMioSceneExchange(sceneData);
    if (!validation.valid || !exchange.valid) {
      alert(`Export Blocked: 3D Scene integrity check failed: ${[...validation.errors, ...exchange.errors].join(', ')}`);
      return false;
    }
    const authorized = await PermissionEngine.requestPermission({
      action: 'EXPORT_3D_ASSET',
      target: filename,
      level: 'L4_EXECUTE',
      changes: ['Bake non-destructive Mio mesh modifiers', 'Serialize authoritative MioMeshData to Wavefront OBJ', 'Trigger client file download'],
      risks: ['Modifier stacks are baked into exported geometry; source scene remains unchanged'],
      expectedResult: `Download ${filename} with ${sceneData.objects.length} authoritative meshes`,
    });
    if (!authorized) return false;
    try {
      const result = serializeMioSceneAsObj(sceneData);
      this.triggerDownload(new Blob([result.data], { type: 'text/plain;charset=utf-8' }), filename);
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Exported authoritative 3D scene as ${filename}`, mode: '3D' });
      return true;
    } catch (error) {
      alert(`Export Blocked: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  public static async export3DAsGltf(sceneData: Mio3DScene, filename: string = 'model.gltf'): Promise<boolean> {
    const exchange = analyzeMioSceneExchange(sceneData);
    if (!exchange.valid) {
      alert(`Export Blocked: ${exchange.errors.join(', ')}`);
      return false;
    }
    const authorized = await PermissionEngine.requestPermission({
      action: 'EXPORT_3D_ASSET',
      target: filename,
      level: 'L4_EXECUTE',
      changes: ['Bake non-destructive Mio mesh modifiers', 'Serialize MIO-3D-V5.9 glTF 2.0 exchange profile', 'Embed binary mesh buffer and MIO round-trip metadata', 'Trigger client file download'],
      risks: exchange.warnings,
      expectedResult: `Download ${filename} with validated geometry/material/UV metadata`,
    });
    if (!authorized) return false;
    try {
      const result = exportMioSceneToGltf(sceneData);
      this.triggerDownload(new Blob([result.data], { type: 'model/gltf+json;charset=utf-8' }), filename);
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Exported 3D scene as ${filename}`, mode: '3D' });
      return true;
    } catch (error) {
      alert(`Export Blocked: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  public static async export3DAsGlb(sceneData: Mio3DScene, filename: string = 'model.glb'): Promise<boolean> {
    const exchange = analyzeMioSceneExchange(sceneData);
    if (!exchange.valid) {
      alert(`Export Blocked: ${exchange.errors.join(', ')}`);
      return false;
    }
    const authorized = await PermissionEngine.requestPermission({
      action: 'EXPORT_3D_ASSET',
      target: filename,
      level: 'L4_EXECUTE',
      changes: ['Bake non-destructive Mio mesh modifiers', 'Serialize MIO-3D-V5.9 binary glTF', 'Preserve exact MIO scene metadata for round-trip', 'Trigger client file download'],
      risks: exchange.warnings,
      expectedResult: `Download ${filename} with validated geometry/material/UV metadata`,
    });
    if (!authorized) return false;
    try {
      const result = exportMioSceneToGlb(sceneData);
      const buffer = result.data.buffer.slice(result.data.byteOffset, result.data.byteOffset + result.data.byteLength) as ArrayBuffer;
      this.triggerDownload(new Blob([buffer], { type: 'model/gltf-binary' }), filename);
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Exported 3D scene as ${filename}`, mode: '3D' });
      return true;
    } catch (error) {
      alert(`Export Blocked: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Export Canvas Graphic as PNG
   */
  public static async exportCanvasAsPNG(canvas: HTMLCanvasElement, filename: string = 'graphic_composition.png', mode: MioSystemMode = 'GRAPHIC'): Promise<boolean> {
    const authorized = await PermissionEngine.requestPermission({
      action: 'EXPORT_GRAPHIC_IMAGE',
      target: filename,
      level: 'L4_EXECUTE',
      changes: ['Render graphic layers to raster PNG image', 'Download to client'],
      risks: [],
      expectedResult: `Export ${canvas.width}x${canvas.height} PNG image`,
    });

    if (!authorized) return false;

    canvas.toBlob((blob) => {
      if (blob) {
        this.triggerDownload(blob, filename);
        eventBus.emit('ACTIVITY_LOG', {
          timestamp: Date.now(),
          message: `Exported graphic design as ${filename}`,
          mode,
        });
      }
    }, 'image/png');

    return true;
  }

  /**
   * Export Audio Buffer to standard WAV format
   */
  public static async exportAudioAsWAV(audioBuffer: AudioBuffer, filename: string = 'sound_effect.wav', mode: MioSystemMode = 'SFX'): Promise<boolean> {
    const authorized = await PermissionEngine.requestPermission({
      action: 'EXPORT_AUDIO_WAV',
      target: filename,
      level: 'L4_EXECUTE',
      changes: ['Encode 16-bit PCM RIFF WAV audio data', 'Trigger audio file download'],
      risks: [],
      expectedResult: `Download ${filename} (${audioBuffer.duration.toFixed(2)}s)`,
    });

    if (!authorized) return false;

    const wavBytes = this.encodeWAV(audioBuffer);
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    this.triggerDownload(blob, filename);

    eventBus.emit('ACTIVITY_LOG', {
      timestamp: Date.now(),
      message: `Exported synthesized audio as ${filename}`,
      mode,
    });
    return true;
  }

  /**
   * Helper to encode AudioBuffer to 16-bit PCM WAV ArrayBuffer
   */
  private static encodeWAV(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = buffer.length;
    const dataSize = samples * blockAlign;
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // RIFF header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave and write 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < samples; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }
}
