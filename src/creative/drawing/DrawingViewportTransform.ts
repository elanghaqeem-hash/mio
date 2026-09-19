export interface DrawingViewport { offsetX:number; offsetY:number; scale:number; }
export interface DrawingSize { width:number; height:number; }
export const createDrawingViewportTransform=(viewport:DrawingViewport)=>{if(!Number.isFinite(viewport.scale)||viewport.scale<=0)throw new Error('DRAWING_VIEWPORT_INVALID'); return {toDocument:(x:number,y:number)=>({x:(x-viewport.offsetX)/viewport.scale,y:(y-viewport.offsetY)/viewport.scale}),toCanvas:(x:number,y:number)=>({x:x*viewport.scale+viewport.offsetX,y:y*viewport.scale+viewport.offsetY})};};
