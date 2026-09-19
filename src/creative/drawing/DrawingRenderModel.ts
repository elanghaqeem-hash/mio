import type { MioDrawingDocument, DrawingLayer, DrawingStroke } from '../../types/creative';
export interface DrawingRenderStroke { layerId:string; layerOpacity:number; stroke:DrawingStroke; }
export interface DrawingRenderModel { width:number; height:number; backgroundColor:string; strokes:DrawingRenderStroke[]; }
export const buildDrawingRenderModel=(document:MioDrawingDocument):DrawingRenderModel=>({width:document.width,height:document.height,backgroundColor:document.backgroundColor,strokes:document.layers.filter((layer:DrawingLayer)=>layer.visible&&layer.opacity>0).flatMap(layer=>layer.strokes.map((stroke:DrawingStroke)=>({layerId:layer.id,layerOpacity:layer.opacity,stroke:structuredClone(stroke)})))});
