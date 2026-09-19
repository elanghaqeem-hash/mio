import type { CreativeCommand, CreativeDocument } from '../../types/creativeDocument';
import type { DrawingInputSample, DrawingPointerType } from './DrawingInput';
import type { MioDrawingDocument, DrawingStroke } from '../../types/creative';
import { DrawingStrokeSession, type DrawingStrokeSessionOptions, type DrawingStrokeStyle } from './DrawingStrokeSession';
import { compileDrawingStrokeCommit } from './DrawingCommitAdapter';

export interface DrawingRuntimeOptions extends DrawingStrokeSessionOptions {}

export class DrawingRuntime {
  private session: DrawingStrokeSession | null = null;

  public constructor(private readonly options: DrawingRuntimeOptions = {}) {}

  public beginStroke(
    id: string,
    layer: MioDrawingDocument['layers'][number],
    sample: DrawingInputSample,
    style: DrawingStrokeStyle,
  ): void {
    if (this.session) throw new Error('DRAWING_STROKE_ALREADY_ACTIVE');
    this.session = new DrawingStrokeSession(id, layer, sample, style, this.options);
  }

  public appendSample(sample: DrawingInputSample): void {
    if (!this.session) throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    this.session.append(sample);
  }

  public cancelStroke(): void {
    if (!this.session) return;
    this.session.cancel();
    this.session = null;
  }

  public finalizeStroke(): DrawingStroke {
    const session = this.requireSession();
    try {
      const stroke = session.finalize();
      this.session = null;
      return stroke;
    } catch (error) {
      // Keep the active session recoverable when finalization validation fails.
      throw error;
    }
  }

  public commitStroke(
    kernelDocument: CreativeDocument,
    fileName: string,
    drawingState: MioDrawingDocument,
    layerId: string,
  ): { stroke: DrawingStroke; nextState: MioDrawingDocument; command: CreativeCommand } {
    const session = this.requireSession();
    const stroke = session.finalize();
    try {
      const result = compileDrawingStrokeCommit(kernelDocument, fileName, drawingState, layerId, stroke);
      // Clear the transient session only after the immutable commit plan succeeds.
      this.session = null;
      return { stroke, ...result };
    } catch (error) {
      // Preserve the finalized session as a recovery point. The canonical document was never mutated.
      throw error;
    }
  }

  public hasActiveStroke(): boolean { return this.session !== null; }
  public activePointerId(): number | null { return this.session?.pointerId ?? null; }
  public activePointerType(): DrawingPointerType | null { return this.session?.pointerType ?? null; }

  private requireSession(): DrawingStrokeSession {
    if (!this.session) throw new Error('DRAWING_STROKE_NOT_ACTIVE');
    return this.session;
  }
}
