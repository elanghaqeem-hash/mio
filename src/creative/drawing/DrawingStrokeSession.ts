import type { DrawingLayer, DrawingStroke } from '../../types/creative';
import { normalizeDrawingInput, type DrawingInputOptions, type DrawingInputSample } from './DrawingInput';
import { processDrawingSamples, type DrawingStrokeProcessorOptions } from './DrawingStrokeProcessor';
import { validateDrawingStroke } from './DrawingValidation';

export interface DrawingStrokeStyle { color: string; size: number; opacity: number; blendMode: DrawingStroke['blendMode'] }
export type DrawingStrokeSessionStatus = 'ACTIVE' | 'COMMITTING' | 'CANCELLED' | 'COMMITTED';

export interface DrawingStrokeSessionOptions {
  input?: DrawingInputOptions;
  processor?: DrawingStrokeProcessorOptions;
  maxRawSamplesPerStroke?: number;
}

export class DrawingStrokeSession {
  public readonly id: string;
  public readonly layerId: string;
  public readonly pointerId: number;
  public readonly pointerType: DrawingInputSample['pointerType'];
  public readonly startedAt: number;
  public readonly style: Readonly<DrawingStrokeStyle>;
  private readonly samples: DrawingInputSample[] = [];
  private statusValue: DrawingStrokeSessionStatus = 'ACTIVE';
  private readonly options: DrawingStrokeSessionOptions;

  public constructor(id: string, layer: DrawingLayer, firstSample: DrawingInputSample, style: DrawingStrokeStyle, options: DrawingStrokeSessionOptions = {}) {
    if (!id) throw new Error('DRAWING_STROKE_ID_REQUIRED');
    if (layer.locked) throw new Error('DRAWING_LAYER_LOCKED');
    const styleValidation = validateDrawingStroke({ id, points: [{ x: 0, y: 0, pressure: 1 }], ...style });
    const styleErrors = styleValidation.errors.filter(error => error.code !== 'EMPTY_STROKE');
    if (styleErrors.length) throw new Error(`DRAWING_STROKE_STYLE_INVALID: ${styleErrors.map(error => error.code).join(',')}`);
    const normalized = normalizeDrawingInput(firstSample, options.input);
    this.id = id;
    this.layerId = layer.id;
    this.pointerId = normalized.pointerId;
    this.pointerType = normalized.pointerType;
    this.startedAt = normalized.timestamp;
    this.style = Object.freeze({ ...style });
    this.options = options;
    this.samples.push(normalized);
  }

  public get status(): DrawingStrokeSessionStatus { return this.statusValue; }
  public get rawSampleCount(): number { return this.samples.length; }
  public snapshotSamples(): DrawingInputSample[] { return this.samples.map(sample => ({ ...sample })); }

  public append(sample: DrawingInputSample): void {
    if (this.statusValue !== 'ACTIVE') throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    const normalized = normalizeDrawingInput(sample, this.options.input);
    if (normalized.pointerId !== this.pointerId) throw new Error('DRAWING_POINTER_OWNERSHIP_MISMATCH');
    const previous = this.samples[this.samples.length - 1];
    if (previous && normalized.timestamp < previous.timestamp) throw new Error('DRAWING_TIMESTAMP_REGRESSION');
    const limit = this.options.maxRawSamplesPerStroke ?? 100000;
    if (this.samples.length >= limit) throw new Error('DRAWING_RAW_SAMPLE_LIMIT_EXCEEDED');
    this.samples.push(normalized);
  }

  public finalize(): DrawingStroke {
    if (this.statusValue !== 'ACTIVE') throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    this.statusValue = 'COMMITTING';
    try {
      const stroke: DrawingStroke = { id: this.id, points: processDrawingSamples(this.samples, this.options.processor), ...this.style };
      const validation = validateDrawingStroke(stroke);
      if (!validation.valid) throw new Error(`DRAWING_STROKE_INVALID: ${validation.errors.map(error => error.code).join(',')}`);
      this.statusValue = 'COMMITTED';
      return stroke;
    } catch (error) {
      this.statusValue = 'ACTIVE';
      throw error;
    }
  }

  public cancel(): void {
    if (this.statusValue !== 'ACTIVE') throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    this.statusValue = 'CANCELLED';
  }
}
