import { ResultValidator } from '../security/ResultValidator';
import { PermissionEngine } from '../security/PermissionEngine';
import { eventBus } from '../core/EventBus';

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
   * Validated 3D OBJ export
   */
  public static async export3DAsObj(sceneData: any, filename: string = 'model.obj'): Promise<boolean> {
    const validation = ResultValidator.validate3D(sceneData);
    if (!validation.valid) {
      alert(`Export Blocked: 3D Scene integrity check failed: ${validation.errors.join(', ')}`);
      return false;
    }

    const authorized = await PermissionEngine.requestPermission({
      action: 'EXPORT_3D_ASSET',
      target: filename,
      level: 'L4_EXECUTE',
      changes: ['Serialize 3D scene objects to Wavefront OBJ format', 'Trigger client file download'],
      risks: ['Export will generate and download local geometry file'],
      expectedResult: `Download ${filename} with ${sceneData.objects.length} meshes`,
    });

    if (!authorized) return false;

    // Generate OBJ file representation
    let objContent = '# Mio V2 Wavefront OBJ Exporter\n';
    let vertexOffset = 1;

    sceneData.objects.forEach((obj: any) => {
      objContent += `o ${obj.name || 'Object'}\n`;
      const [px, py, pz] = obj.position || [0, 0, 0];
      const [sx, sy, sz] = obj.scale || [1, 1, 1];

      // Standard unit cube mesh coordinates scaled & translated
      const cubeVertices = [
        [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
        [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]
      ];

      cubeVertices.forEach(([vx, vy, vz]) => {
        objContent += `v ${(vx * sx + px).toFixed(4)} ${(vy * sy + py).toFixed(4)} ${(vz * sz + pz).toFixed(4)}\n`;
      });

      const faces = [
        [1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2],
        [2, 6, 7, 3], [3, 7, 8, 4], [5, 1, 4, 8]
      ];

      faces.forEach((f) => {
        objContent += `f ${f.map((idx) => idx + vertexOffset - 1).join(' ')}\n`;
      });

      vertexOffset += 8;
    });

    const blob = new Blob([objContent], { type: 'text/plain' });
    this.triggerDownload(blob, filename);

    eventBus.emit('ACTIVITY_LOG', {
      timestamp: Date.now(),
      message: `Exported 3D scene as ${filename}`,
      mode: '3D',
    });
    return true;
  }

  /**
   * Export Canvas Graphic as PNG
   */
  public static async exportCanvasAsPNG(canvas: HTMLCanvasElement, filename: string = 'graphic_composition.png'): Promise<boolean> {
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
          mode: 'GRAPHIC',
        });
      }
    }, 'image/png');

    return true;
  }

  /**
   * Export Audio Buffer to standard WAV format
   */
  public static async exportAudioAsWAV(audioBuffer: AudioBuffer, filename: string = 'sound_effect.wav'): Promise<boolean> {
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
      mode: 'SFX',
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
