import type { DrawingLayer, DrawingPoint, DrawingStroke, MioDrawingDocument } from '../../types/creative';

export interface DrawingValidationIssue { code: string; path: string; message: string }
export interface DrawingValidationResult { valid: boolean; errors: DrawingValidationIssue[] }
export interface DrawingValidationLimits {
  maxCanvasDimension: number;
  maxLayers: number;
  maxStrokesPerLayer: number;
  maxPointsPerStroke: number;
  maxTotalPoints: number;
}

export const DEFAULT_DRAWING_VALIDATION_LIMITS: DrawingValidationLimits = {
  maxCanvasDimension: 32768,
  maxLayers: 4096,
  maxStrokesPerLayer: 100000,
  maxPointsPerStroke: 100000,
  maxTotalPoints: 5000000,
};

const issue = (errors: DrawingValidationIssue[], code: string, path: string, message: string): void => { errors.push({ code, path, message }); };
const validColor = (value: string): boolean => /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
const validBlendModes = new Set<DrawingStroke['blendMode']>(['normal', 'multiply', 'screen', 'erase']);

export const validateDrawingPoint = (point: DrawingPoint, path = 'point'): DrawingValidationResult => {
  const errors: DrawingValidationIssue[] = [];
  if (!Number.isFinite(point.x)) issue(errors, 'INVALID_POINT_X', `${path}.x`, 'Point x must be finite.');
  if (!Number.isFinite(point.y)) issue(errors, 'INVALID_POINT_Y', `${path}.y`, 'Point y must be finite.');
  if (!Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1) issue(errors, 'INVALID_PRESSURE', `${path}.pressure`, 'Pressure must be between 0 and 1.');
  return { valid: errors.length === 0, errors };
};

export const validateDrawingStroke = (stroke: DrawingStroke, path = 'stroke', limits = DEFAULT_DRAWING_VALIDATION_LIMITS): DrawingValidationResult => {
  const errors: DrawingValidationIssue[] = [];
  if (!stroke.id) issue(errors, 'INVALID_STROKE_ID', `${path}.id`, 'Stroke ID is required.');
  if (!Number.isFinite(stroke.size) || stroke.size <= 0) issue(errors, 'INVALID_STROKE_SIZE', `${path}.size`, 'Stroke size must be positive.');
  if (!Number.isFinite(stroke.opacity) || stroke.opacity < 0 || stroke.opacity > 1) issue(errors, 'INVALID_STROKE_OPACITY', `${path}.opacity`, 'Stroke opacity must be between 0 and 1.');
  if (!validBlendModes.has(stroke.blendMode)) issue(errors, 'INVALID_BLEND_MODE', `${path}.blendMode`, 'Unsupported drawing blend mode.');
  if (!validColor(stroke.color)) issue(errors, 'INVALID_STROKE_COLOR', `${path}.color`, 'Stroke color must be a supported hex color.');
  if (!stroke.points.length) issue(errors, 'EMPTY_STROKE', `${path}.points`, 'A stroke must contain at least one point.');
  if (stroke.points.length > limits.maxPointsPerStroke) issue(errors, 'STROKE_POINT_LIMIT_EXCEEDED', `${path}.points`, 'Stroke point limit exceeded.');
  stroke.points.forEach((point, index) => errors.push(...validateDrawingPoint(point, `${path}.points[${index}]`).errors));
  return { valid: errors.length === 0, errors };
};

export const validateDrawingLayer = (layer: DrawingLayer, path = 'layer', limits = DEFAULT_DRAWING_VALIDATION_LIMITS): DrawingValidationResult => {
  const errors: DrawingValidationIssue[] = [];
  if (!layer.id) issue(errors, 'INVALID_LAYER_ID', `${path}.id`, 'Layer ID is required.');
  if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) issue(errors, 'INVALID_LAYER_OPACITY', `${path}.opacity`, 'Layer opacity must be between 0 and 1.');
  if (layer.strokes.length > limits.maxStrokesPerLayer) issue(errors, 'LAYER_STROKE_LIMIT_EXCEEDED', `${path}.strokes`, 'Layer stroke limit exceeded.');
  const strokeIds = new Set<string>();
  layer.strokes.forEach((stroke, index) => {
    if (strokeIds.has(stroke.id)) issue(errors, 'DUPLICATE_STROKE_ID', `${path}.strokes[${index}].id`, 'Stroke IDs must be unique within a layer.');
    strokeIds.add(stroke.id);
    errors.push(...validateDrawingStroke(stroke, `${path}.strokes[${index}]`, limits).errors);
  });
  return { valid: errors.length === 0, errors };
};

export const validateDrawingDocument = (document: MioDrawingDocument, limits = DEFAULT_DRAWING_VALIDATION_LIMITS): DrawingValidationResult => {
  const errors: DrawingValidationIssue[] = [];
  if (!Number.isFinite(document.width) || document.width <= 0 || document.width > limits.maxCanvasDimension) issue(errors, 'INVALID_CANVAS_WIDTH', 'width', 'Canvas width is outside supported limits.');
  if (!Number.isFinite(document.height) || document.height <= 0 || document.height > limits.maxCanvasDimension) issue(errors, 'INVALID_CANVAS_HEIGHT', 'height', 'Canvas height is outside supported limits.');
  if (!validColor(document.backgroundColor)) issue(errors, 'INVALID_BACKGROUND_COLOR', 'backgroundColor', 'Background must be a supported hex color.');
  if (!document.layers.length) issue(errors, 'EMPTY_LAYER_STACK', 'layers', 'Drawing document requires at least one layer.');
  if (document.layers.length > limits.maxLayers) issue(errors, 'LAYER_LIMIT_EXCEEDED', 'layers', 'Layer limit exceeded.');
  const layerIds = new Set<string>();
  let totalPoints = 0;
  document.layers.forEach((layer, index) => {
    if (layerIds.has(layer.id)) issue(errors, 'DUPLICATE_LAYER_ID', `layers[${index}].id`, 'Layer IDs must be unique.');
    layerIds.add(layer.id);
    totalPoints += layer.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    errors.push(...validateDrawingLayer(layer, `layers[${index}]`, limits).errors);
  });
  if (totalPoints > limits.maxTotalPoints) issue(errors, 'DOCUMENT_POINT_LIMIT_EXCEEDED', 'layers', 'Document point limit exceeded.');
  return { valid: errors.length === 0, errors };
};
