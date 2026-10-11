import type { DrawingStroke } from '../../types/creative';
import type { DrawingBrushSettings } from './DrawingBrushEngine';
import { createDrawingBrushPreview, type DrawingBrushPreview } from './DrawingBrushPreview';
export class DrawingBrushRuntime {
 private preview:DrawingBrushPreview|null=null;
 updateTransient(stroke:DrawingStroke,settings:DrawingBrushSettings):DrawingBrushPreview { this.preview=createDrawingBrushPreview(stroke,settings); return structuredClone(this.preview); }
 getTransient():DrawingBrushPreview|null { return this.preview?structuredClone(this.preview):null; }
 clearTransient():void { this.preview=null; }
}
