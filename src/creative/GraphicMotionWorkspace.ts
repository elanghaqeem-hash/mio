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

const inverseRotateGraphicPoint=(point:Point2D,layer:GraphicLayer):Point2D=>{
  const radians=(layer.rotation??0)*Math.PI/180; if(!radians)return point;
  const cx=layer.x+layer.width/2,cy=layer.y+layer.height/2,dx=point.x-cx,dy=point.y-cy;
  const cos=Math.cos(-radians),sin=Math.sin(-radians);
  return {x:cx+dx*cos-dy*sin,y:cy+dx*sin+dy*cos};
};
export const hitTestGraphicLayers=(document:MioGraphicDocument,point:Point2D):string[]=>[...document.layers].reverse().filter(layer=>{
  if(!layer.visible)return false; const local=inverseRotateGraphicPoint(point,layer),b=bounds(layer);
  return local.x>=b.left&&local.x<=b.right&&local.y>=b.top&&local.y<=b.bottom;
}).map(layer=>layer.id);

export const toggleGraphicSelection=(current:string[],id:string,additive=false):string[]=>{
  if(!additive)return [id];
  return current.includes(id)?current.filter(item=>item!==id):[...current,id];
};

export const nudgeGraphicLayers=(document:MioGraphicDocument,ids:string[],dx:number,dy:number):MioGraphicDocument=>({
  ...document,layers:document.layers.map(layer=>ids.includes(layer.id)&&!layer.locked?{...layer,x:layer.x+dx,y:layer.y+dy}:layer)
});


export type GraphicResizeHandle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export interface GraphicResizeSession { id:string; handle:GraphicResizeHandle; start:Point2D; origin:{x:number;y:number;width:number;height:number}; aspectRatio:number; }

export const beginGraphicResize=(document:MioGraphicDocument,id:string,handle:GraphicResizeHandle,start:Point2D):GraphicResizeSession|null=>{
  const layer=document.layers.find(item=>item.id===id&&!item.locked); if(!layer)return null;
  return {id,handle,start,origin:{x:layer.x,y:layer.y,width:layer.width,height:layer.height},aspectRatio:layer.width/Math.max(1,layer.height)};
};

export const updateGraphicResize=(document:MioGraphicDocument,session:GraphicResizeSession,pointer:Point2D,keepAspect=false,minSize=4):MioGraphicDocument=>{
  const dx=pointer.x-session.start.x,dy=pointer.y-session.start.y; const o=session.origin;
  let x=o.x,y=o.y,width=o.width,height=o.height;
  if(session.handle.includes('e')) width=Math.max(minSize,o.width+dx);
  if(session.handle.includes('s')) height=Math.max(minSize,o.height+dy);
  if(session.handle.includes('w')){width=Math.max(minSize,o.width-dx);x=o.x+o.width-width;}
  if(session.handle.includes('n')){height=Math.max(minSize,o.height-dy);y=o.y+o.height-height;}
  if(keepAspect){
    const horizontal=session.handle==='e'||session.handle==='w';
    if(horizontal) height=Math.max(minSize,width/session.aspectRatio);
    else width=Math.max(minSize,height*session.aspectRatio);
    if(session.handle.includes('w'))x=o.x+o.width-width;
    if(session.handle.includes('n'))y=o.y+o.height-height;
  }
  return {...document,layers:document.layers.map(layer=>layer.id===session.id?{...layer,x,y,width,height}:layer)};
};

export const duplicateGraphicLayers=(document:MioGraphicDocument,ids:string[],offset=16):{document:MioGraphicDocument;ids:string[]}=>{
  const created=document.layers.filter(layer=>ids.includes(layer.id)).map((layer,index)=>({...structuredClone(layer),id:`${layer.id}_copy_${Date.now().toString(36)}_${index}`,name:`${layer.name} Copy`,x:layer.x+offset,y:layer.y+offset,locked:false}));
  return {document:{...document,layers:[...document.layers,...created]},ids:created.map(layer=>layer.id)};
};

export const deleteGraphicLayers=(document:MioGraphicDocument,ids:string[]):MioGraphicDocument=>({...document,layers:document.layers.filter(layer=>!ids.includes(layer.id)||layer.locked)});

export const setGraphicLayerOrder=(document:MioGraphicDocument,id:string,target:'front'|'back'|'forward'|'backward'):MioGraphicDocument=>{
  const index=document.layers.findIndex(layer=>layer.id===id); if(index<0)return document;
  const layers=[...document.layers], [layer]=layers.splice(index,1);
  const next=target==='front'?layers.length:target==='back'?0:target==='forward'?Math.min(layers.length,index+1):Math.max(0,index-1);
  layers.splice(next,0,layer); return {...document,layers};
};

export const createMotionTrackId=(nodeId:string,property:string):string=>`track_${nodeId}_${property}`;

export const upsertMotionKeyframe=(project:MioMotionProject,nodeId:string,property:import('../types/creative').MotionProperty,time:number,value:number,interpolation:import('../types/creative').AnimationInterpolation='easeInOut'):MioMotionProject=>{
  const trackId=createMotionTrackId(nodeId,property), keyTime=snapMotionProjectTime(time,project.fps);
  const existing=project.tracks.find(track=>track.id===trackId);
  const keyframe={id:`key_${nodeId}_${property}_${Math.round(keyTime*1000)}`,time:keyTime,value,interpolation};
  return {...project,tracks:existing?project.tracks.map(track=>track.id===trackId?{...track,keyframes:[...track.keyframes.filter(key=>Math.abs(key.time-keyTime)>.0005),keyframe].sort((a,b)=>a.time-b.time)}:track):[...project.tracks,{id:trackId,nodeId,property,keyframes:[keyframe]}]};
};

export const deleteMotionKeyframe=(project:MioMotionProject,trackId:string,keyId:string):MioMotionProject=>({...project,tracks:project.tracks.map(track=>track.id===trackId?{...track,keyframes:track.keyframes.filter(key=>key.id!==keyId)}:track).filter(track=>track.keyframes.length>0)});

export const moveMotionKeyframe=(project:MioMotionProject,trackId:string,keyId:string,time:number):MioMotionProject=>({...project,tracks:project.tracks.map(track=>track.id===trackId?{...track,keyframes:track.keyframes.map(key=>key.id===keyId?{...key,time:snapMotionProjectTime(Math.max(0,Math.min(project.duration,time)),project.fps)}:key).sort((a,b)=>a.time-b.time)}:track)});

export const setMotionKeyframeInterpolation=(project:MioMotionProject,trackId:string,keyId:string,interpolation:import('../types/creative').AnimationInterpolation):MioMotionProject=>({...project,tracks:project.tracks.map(track=>track.id===trackId?{...track,keyframes:track.keyframes.map(key=>key.id===keyId?{...key,interpolation}:key)}:track)});

const snapMotionProjectTime=(time:number,fps:number)=>Number((Math.round(time*fps)/fps).toFixed(3));


export interface GraphicRotationSession { id:string; center:Point2D; startAngle:number; originRotation:number; }
export const beginGraphicRotation=(document:MioGraphicDocument,id:string,start:Point2D):GraphicRotationSession|null=>{
  const layer=document.layers.find(item=>item.id===id&&!item.locked); if(!layer)return null;
  const center={x:layer.x+layer.width/2,y:layer.y+layer.height/2};
  return {id,center,startAngle:Math.atan2(start.y-center.y,start.x-center.x),originRotation:layer.rotation??0};
};
export const updateGraphicRotation=(document:MioGraphicDocument,session:GraphicRotationSession,pointer:Point2D,snapDegrees=0):MioGraphicDocument=>{
  const angle=Math.atan2(pointer.y-session.center.y,pointer.x-session.center.x);
  let rotation=session.originRotation+(angle-session.startAngle)*180/Math.PI;
  if(snapDegrees>0) rotation=Math.round(rotation/snapDegrees)*snapDegrees;
  rotation=((rotation%360)+360)%360;
  return {...document,layers:document.layers.map(layer=>layer.id===session.id?{...layer,rotation:Number(rotation.toFixed(2))}:layer)};
};


export interface GraphicSelectionBounds { left:number; top:number; right:number; bottom:number; width:number; height:number; centerX:number; centerY:number; }
export const getGraphicLayerCorners=(layer:GraphicLayer):Point2D[]=>{
  const cx=layer.x+layer.width/2,cy=layer.y+layer.height/2,r=(layer.rotation??0)*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r);
  return [[layer.x,layer.y],[layer.x+layer.width,layer.y],[layer.x+layer.width,layer.y+layer.height],[layer.x,layer.y+layer.height]].map(([x,y])=>{const dx=x-cx,dy=y-cy;return {x:cx+dx*cos-dy*sin,y:cy+dx*sin+dy*cos};});
};
export const getGraphicSelectionBounds=(document:MioGraphicDocument,ids:string[]):GraphicSelectionBounds|null=>{
  const points=document.layers.filter(layer=>ids.includes(layer.id)&&layer.visible).flatMap(getGraphicLayerCorners); if(!points.length)return null;
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  return {left,top,right,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
};


export interface GraphicGroupResizeSession { ids:string[]; bounds:GraphicSelectionBounds; origins:Record<string,{x:number;y:number;width:number;height:number}>; }
export const beginGraphicGroupResize=(document:MioGraphicDocument,ids:string[]):GraphicGroupResizeSession|null=>{
  const unlocked=ids.filter(id=>document.layers.some(layer=>layer.id===id&&!layer.locked)); const selection=getGraphicSelectionBounds(document,unlocked); if(!selection||unlocked.length<2)return null;
  return {ids:unlocked,bounds:selection,origins:Object.fromEntries(document.layers.filter(layer=>unlocked.includes(layer.id)).map(layer=>[layer.id,{x:layer.x,y:layer.y,width:layer.width,height:layer.height}]))};
};
export const updateGraphicGroupResize=(document:MioGraphicDocument,session:GraphicGroupResizeSession,nextWidth:number,nextHeight:number,minSize=4):MioGraphicDocument=>{
  const sx=Math.max(minSize,nextWidth)/Math.max(1,session.bounds.width),sy=Math.max(minSize,nextHeight)/Math.max(1,session.bounds.height);
  return {...document,layers:document.layers.map(layer=>{const o=session.origins[layer.id];if(!o)return layer;return {...layer,x:session.bounds.left+(o.x-session.bounds.left)*sx,y:session.bounds.top+(o.y-session.bounds.top)*sy,width:Math.max(minSize,o.width*sx),height:Math.max(minSize,o.height*sy)};})};
};
