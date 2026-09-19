import type { CreativeCommand, CreativeDocument } from '../../types/creativeDocument';
import type { DrawingInputSample, DrawingPointerType } from './DrawingInput';
import type { MioDrawingDocument, DrawingStroke } from '../../types/creative';
import { DrawingStrokeSession, type DrawingStrokeSessionOptions, type DrawingStrokeStyle } from './DrawingStrokeSession';
import { compileDrawingStrokeCommit } from './DrawingCommitAdapter';

export interface DrawingRuntimeOptions extends DrawingStrokeSessionOptions {}

export class DrawingRuntime {
  private session: DrawingStrokeSession | null = null;
  public constructor(private readonly options: DrawingRuntimeOptions = {}) {}
  public beginStroke(id: string, layer: MioDrawingDocument['layers'][number], sample: DrawingInputSample, style: DrawingStrokeStyle): void {
    if (this.session) throw new Error('DRAWING_STROKE_ALREADY_ACTIVE');
    this.session = new DrawingStrokeSession(id, layer, sample, style, this.options);
  }
  public appendSample(sample: DrawingInputSample): void {
    if (!this.session) throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    this.session.append(sample);
  }
  public cancelStroke(): void { if (this.session) { this.session.cancel(); this.session = null; } }
  public finalizeStroke(): DrawingStroke {
    if (!this.session) throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    const session = this.session;
    try { return session.finalize(); } finally { this.session = null; }
  }
  public commitStroke(kernelDocument: CreativeDocument, fileName: string, drawingState: MioDrawingDocument, layerId: string): { stroke: DrawingStroke; nextState: MioDrawingDocument; command: CreativeCommand } {
    const stroke = this.finalizeStroke();
    return { stroke, ...compileDrawingStrokeCommit(kernelDocument, fileName, drawingState, layerId, stroke) };
  }
  public hasActiveStroke(): boolean { return this.session !== null; }
  public activePointerId(): number | null { return this.session?.pointerId ?? null; }
  public activePointerType(): DrawingPointerType | null { return this.session?.pointerType ?? null; }
}
