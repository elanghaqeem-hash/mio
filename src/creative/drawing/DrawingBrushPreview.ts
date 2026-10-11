import type { DrawingStroke } from '../../types/creative';
import type { DrawingBrushSettings, DrawingBrushSample } from './DrawingBrushEngine';
import { sampleDrawingBrush } from './DrawingBrushEngine';
export interface DrawingBrushPreview { strokeId:string; color:string; blendMode:DrawingStroke['blendMode']; samples:DrawingBrushSample[]; }
export const createDrawingBrushPreview=(stroke:DrawingStroke,settings:DrawingBrushSettings):DrawingBrushPreview=>({strokeId:stroke.id,color:stroke.color,blendMode:stroke.blendMode,samples:sampleDrawingBrush(stroke,settings)});
