import type { CreativeCommand, CreativeDocument } from '../../types/creativeDocument';
import type { DrawingStroke, MioDrawingDocument } from '../../types/creative';
import { createStudioStateCommand } from '../useCreativeStudioDocument';
import { validateDrawingDocument, validateDrawingStroke } from './DrawingValidation';

export interface DrawingCommitResult { nextState: MioDrawingDocument; command: CreativeCommand; }
const clone = <T>(value: T): T => structuredClone(value);

export const appendDrawingStroke = (document: MioDrawingDocument, layerId: string, stroke: DrawingStroke): MioDrawingDocument => {
  const docValidation = validateDrawingDocument(document);
  if (!docValidation.valid) throw new Error(`DRAWING_DOCUMENT_INVALID: ${docValidation.errors.map(e => e.code).join(',')}`);
  const strokeValidation = validateDrawingStroke(stroke);
  if (!strokeValidation.valid) throw new Error(`DRAWING_STROKE_INVALID: ${strokeValidation.errors.map(e => e.code).join(',')}`);
  const next = clone(document);
  const layer = next.layers.find(item => item.id === layerId);
  if (!layer) throw new Error('DRAWING_LAYER_NOT_FOUND');
  if (layer.locked) throw new Error('DRAWING_LAYER_LOCKED');
  if (layer.strokes.some(item => item.id === stroke.id)) throw new Error('DRAWING_STROKE_ID_EXISTS');
  layer.strokes.push(clone(stroke));
  return next;
};

export const compileDrawingStrokeCommit = (kernelDocument: CreativeDocument, fileName: string, drawingState: MioDrawingDocument, layerId: string, stroke: DrawingStroke): DrawingCommitResult => {
  const nextState = appendDrawingStroke(drawingState, layerId, stroke);
  return { nextState, command: createStudioStateCommand(kernelDocument, fileName, nextState) };
};
