import type { MioDrawingDocument } from '../../types/creative';
import { buildDrawingRenderModel, type DrawingRenderModel } from './DrawingRenderModel';
import { rasterizeDrawingStroke, type RasterStroke } from './DrawingStrokeRasterizer';
export interface DrawingRenderFrame extends DrawingRenderModel { rasterStrokes:RasterStroke[]; }
export const renderDrawingReference=(document:MioDrawingDocument):DrawingRenderFrame=>{const model=buildDrawingRenderModel(document); return {...model,rasterStrokes:model.strokes.map(item=>rasterizeDrawingStroke(item.stroke))};};
