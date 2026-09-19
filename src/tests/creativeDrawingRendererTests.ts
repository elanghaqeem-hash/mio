import { buildDrawingRenderModel } from '../creative/drawing/DrawingRenderModel';
import { rasterizeDrawingStroke } from '../creative/drawing/DrawingStrokeRasterizer';
import { createDrawingViewportTransform } from '../creative/drawing/DrawingViewportTransform';
import { renderDrawingReference } from '../creative/drawing/DrawingRenderer';
import type { MioDrawingDocument } from '../types/creative';

const doc=():MioDrawingDocument=>({width:100,height:80,backgroundColor:'#fff',layers:[
 {id:'hidden',name:'Hidden',visible:false,locked:false,opacity:1,strokes:[]},
 {id:'empty',name:'Empty',visible:true,locked:false,opacity:0,strokes:[]},
 {id:'ink',name:'Ink',visible:true,locked:false,opacity:.5,strokes:[{id:'s',points:[{x:10,y:20,pressure:1},{x:20,y:20,pressure:.5}],color:'#000',size:10,opacity:.8,blendMode:'normal'}]}
]});
const assert=(value:unknown,message:string):void=>{if(!value)throw new Error(message);};

export function runCreativeDrawingRendererTests():{passed:number;total:number}{
 const d=doc(); const m=buildDrawingRenderModel(d);
 assert(m.strokes.length===1,'hidden or zero-opacity layer rendered');
 const r=rasterizeDrawingStroke(m.strokes[0].stroke);
 assert(r.circles[0].radius===5&&r.circles[1].radius===2.5,'pressure mapping incorrect');
 const t=createDrawingViewportTransform({offsetX:10,offsetY:5,scale:2});
 const p=t.toDocument(30,25); const q=t.toCanvas(p.x,p.y);
 assert(p.x===10&&p.y===10&&q.x===30&&q.y===25,'viewport transform round-trip failed');
 const frame=renderDrawingReference(d);
 assert(frame.rasterStrokes.length===1&&frame.rasterStrokes[0].id==='s','reference frame mismatch');
 const before=JSON.stringify(d); renderDrawingReference(d); assert(JSON.stringify(d)===before,'renderer mutated source document');
 return {passed:5,total:5};
}
