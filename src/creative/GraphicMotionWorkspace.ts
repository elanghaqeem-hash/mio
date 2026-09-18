import type { GraphicLayer, MioGraphicDocument, MioMotionProject, MotionLayer } from '../types/creative';

export type AlignmentAxis = 'left'|'centerX'|'right'|'top'|'centerY'|'bottom';
export type DistributionAxis = 'horizontal'|'vertical';

const bounds = (layer: Pick<GraphicLayer,'x'|'y'|'width'|'height'>) => ({
  left: layer.x, top: layer.y, right: layer.x + layer.width, bottom: layer.y + layer.height,
  centerX: layer.x + layer.width / 2, centerY: layer.y + layer.height / 2,
});

export const alignGraphicLayers = (document: MioGraphicDocument, ids: string[], axis: AlignmentAxis): MioGraphicDocument => {
  const selected = document.layers.filter(layer => ids.includes(layer.id) && !layer.locked);
  if (selected.length < 2) return document;
  const boxes = selected.map(bounds);
  const target = axis === 'left' ? Math.min(...boxes.map(b=>b.left))
    : axis === 'right' ? Math.max(...boxes.map(b=>b.right))
    : axis === 'top' ? Math.min(...boxes.map(b=>b.top))
    : axis === 'bottom' ? Math.max(...boxes.map(b=>b.bottom))
    : axis === 'centerX' ? boxes.reduce((n,b)=>n+b.centerX,0)/boxes.length
    : boxes.reduce((n,b)=>n+b.centerY,0)/boxes.length;
  return {...document,layers:document.layers.map(layer=>{
    if (!ids.includes(layer.id)||layer.locked) return layer;
    const b=bounds(layer);
    if(axis==='left') return {...layer,x:target};
    if(axis==='right') return {...layer,x:target-layer.width};
    if(axis==='top') return {...layer,y:target};
    if(axis==='bottom') return {...layer,y:target-layer.height};
    if(axis==='centerX') return {...layer,x:layer.x+(target-b.centerX)};
    return {...layer,y:layer.y+(target-b.centerY)};
  })};
};

export const distributeGraphicLayers = (document:MioGraphicDocument, ids:string[], axis:DistributionAxis):MioGraphicDocument=>{
  const selected=document.layers.filter(l=>ids.includes(l.id)&&!l.locked);
  if(selected.length<3) return document;
  const ordered=[...selected].sort((a,b)=>axis==='horizontal'?a.x-b.x:a.y-b.y);
  const first=ordered[0], last=ordered.at(-1)!;
  const totalSize=ordered.reduce((n,l)=>n+(axis==='horizontal'?l.width:l.height),0);
  const span=axis==='horizontal'?(last.x+last.width-first.x):(last.y+last.height-first.y);
  const gap=(span-totalSize)/(ordered.length-1);
  let cursor=axis==='horizontal'?first.x:first.y;
  const positions=new Map<string,number>();
  for(const layer of ordered){positions.set(layer.id,cursor);cursor+=(axis==='horizontal'?layer.width:layer.height)+gap;}
  return {...document,layers:document.layers.map(l=>positions.has(l.id)?{...l,[axis==='horizontal'?'x':'y']:positions.get(l.id)!}:l)};
};

export const snapGraphicPosition=(value:number,gridSize=8,enabled=true):number=>enabled?Math.round(value/gridSize)*gridSize:value;

export const graphicToMotionProject=(document:MioGraphicDocument, duration=6, fps=30):MioMotionProject=>{
  const layers:MotionLayer[]=document.layers.filter(l=>l.visible&&(l.type==='shape'||l.type==='text')).map(l=>({
    id:`motion_${l.id}`,name:l.name,type:l.type as 'shape'|'text',visible:l.visible,locked:l.locked,
    x:l.x+l.width/2,y:l.y+l.height/2,width:l.width,height:l.height,scale:1,rotation:l.rotation??0,opacity:l.opacity,
    fill:l.fill??'#ffffff',text:l.text,fontSize:l.fontSize,borderRadius:l.shapeType==='circle'?Math.min(l.width,l.height)/2:0,
  }));
  return {width:document.width,height:document.height,backgroundColor:document.backgroundColor,duration,fps,currentTime:0,loop:true,layers,tracks:[]};
};


export interface Point2D { x:number; y:number }
export interface GraphicDragSession { ids:string[]; start:Point2D; origins:Record<string,Point2D>; gridSize:number; snap:boolean }

export const beginGraphicDrag=(document:MioGraphicDocument,ids:string[],start:Point2D,gridSize=8,snap=true):GraphicDragSession=>({
  ids:ids.filter(id=>document.layers.some(layer=>layer.id===id&&!layer.locked)),
  start,gridSize,snap,
  origins:Object.fromEntries(document.layers.filter(layer=>ids.includes(layer.id)&&!layer.locked).map(layer=>[layer.id,{x:layer.x,y:layer.y}]))
});

export const updateGraphicDrag=(document:MioGraphicDocument,session:GraphicDragSession,pointer:Point2D):MioGraphicDocument=>{
  const dx=pointer.x-session.start.x,dy=pointer.y-session.start.y;
  return {...document,layers:document.layers.map(layer=>{
    const origin=session.origins[layer.id]; if(!origin)return layer;
    return {...layer,x:snapGraphicPosition(origin.x+dx,session.gridSize,session.snap),y:snapGraphicPosition(origin.y+dy,session.gridSize,session.snap)};
  })};
};

export const hitTestGraphicLayers=(document:MioGraphicDocument,point:Point2D):string[]=>[...document.layers].reverse().filter(layer=>{
  if(!layer.visible)return false; const b=bounds(layer);
  return point.x>=b.left&&point.x<=b.right&&point.y>=b.top&&point.y<=b.bottom;
}).map(layer=>layer.id);

export const toggleGraphicSelection=(current:string[],id:string,additive=false):string[]=>{
  if(!additive)return [id];
  return current.includes(id)?current.filter(item=>item!==id):[...current,id];
};

export const nudgeGraphicLayers=(document:MioGraphicDocument,ids:string[],dx:number,dy:number):MioGraphicDocument=>({
  ...document,layers:document.layers.map(layer=>ids.includes(layer.id)&&!layer.locked?{...layer,x:layer.x+dx,y:layer.y+dy}:layer)
});


export type GraphicResizeHandle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export interface GraphicTransformSession { id:string; start:Point2D; origin:GraphicLayer; mode:'resize'|'rotate'; handle?:GraphicResizeHandle; aspectLocked:boolean; }

export const beginGraphicResize=(layer:GraphicLayer,start:Point2D,handle:GraphicResizeHandle,aspectLocked=false):GraphicTransformSession=>({id:layer.id,start,origin:{...layer},mode:'resize',handle,aspectLocked});
export const updateGraphicResize=(document:MioGraphicDocument,session:GraphicTransformSession,pointer:Point2D,minSize=8):MioGraphicDocument=>{
 const dx=pointer.x-session.start.x,dy=pointer.y-session.start.y,o=session.origin,h=session.handle??'se';
 let x=o.x,y=o.y,w=o.width,hgt=o.height;
 if(h.includes('e'))w=Math.max(minSize,o.width+dx); if(h.includes('s'))hgt=Math.max(minSize,o.height+dy);
 if(h.includes('w')){w=Math.max(minSize,o.width-dx);x=o.x+(o.width-w);} if(h.includes('n')){hgt=Math.max(minSize,o.height-dy);y=o.y+(o.height-hgt);}
 if(session.aspectLocked){const ratio=o.width/Math.max(1,o.height);if(Math.abs(dx)>=Math.abs(dy))hgt=w/ratio;else w=hgt*ratio;}
 return {...document,layers:document.layers.map(l=>l.id===session.id&&!l.locked?{...l,x,y,width:w,height:hgt}:l)};
};
export const beginGraphicRotation=(layer:GraphicLayer,start:Point2D):GraphicTransformSession=>({id:layer.id,start,origin:{...layer},mode:'rotate',aspectLocked:false});
export const updateGraphicRotation=(document:MioGraphicDocument,session:GraphicTransformSession,pointer:Point2D,snapDegrees=0):MioGraphicDocument=>{
 const o=session.origin,cx=o.x+o.width/2,cy=o.y+o.height/2;
 const start=Math.atan2(session.start.y-cy,session.start.x-cx),current=Math.atan2(pointer.y-cy,pointer.x-cx);
 let degrees=(o.rotation??0)+(current-start)*180/Math.PI;
 if(snapDegrees>0)degrees=Math.round(degrees/snapDegrees)*snapDegrees;
 return {...document,layers:document.layers.map(l=>l.id===session.id&&!l.locked?{...l,rotation:Number(degrees.toFixed(2))}:l)};
};
export const getGraphicSelectionBounds=(document:MioGraphicDocument,ids:string[])=>{
 const selected=document.layers.filter(l=>ids.includes(l.id)&&l.visible);if(!selected.length)return null;
 const b=selected.map(bounds);const left=Math.min(...b.map(v=>v.left)),top=Math.min(...b.map(v=>v.top)),right=Math.max(...b.map(v=>v.right)),bottom=Math.max(...b.map(v=>v.bottom));
 return {left,top,right,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
};
