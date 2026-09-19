import { buildDrawingRenderModel } from '../creative/drawing/DrawingRenderModel';
import { rasterizeDrawingStroke } from '../creative/drawing/DrawingStrokeRasterizer';
import { createDrawingViewportTransform } from '../creative/drawing/DrawingViewportTransform';
import type { MioDrawingDocument } from '../types/creative';
const doc=():MioDrawingDocument=>({width:100,height:80,backgroundColor:'#fff',layers:[{id:'hidden',name:'Hidden',visible:false,locked:false,opacity:1,strokes:[]},{id:'ink',name:'Ink',visible:true,locked:false,opacity:.5,strokes:[{id:'s',points:[{x:10,y:20,pressure:1},{x:20,y:20,pressure:.5}],color:'#000',size:10,opacity:.8,blendMode:'normal'}]}]});
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
export function runCreativeDrawingRendererTests(){const d=doc();const m=buildDrawingRenderModel(d);assert(m.strokes.length===1,'hidden layer rendered');const r=rasterizeDrawingStroke(m.strokes[0].stroke);assert(r.circles[0].radius===5,'pressure size mapping incorrect');assert(r.circles[1].radius===2.5,'pressure interpolation incorrect');const t=createDrawingViewportTransform({offsetX:10,offsetY:5,scale:2});const p=t.toDocument(30,25);assert(p.x===10&&p.y===10,'viewport inverse transform incorrect');return {passed:3,total:3};}
