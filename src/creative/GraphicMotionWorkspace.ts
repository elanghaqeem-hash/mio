import type { GraphicLayer, MioGraphicDocument, MioMotionProject, MotionLayer } from '../types/creative';

export const graphicLayerLocalToWorld=(layer:GraphicLayer,point:Point2D):Point2D=>{const center={x:layer.x+layer.width/2,y:layer.y+layer.height/2},world={x:layer.x+point.x,y:layer.y+point.y};return rotateGraphicVector(world,center,layer.rotation??0);};
export const graphicLayerWorldToLocal=(layer:GraphicLayer,point:Point2D):Point2D=>{const center={x:layer.x+layer.width/2,y:layer.y+layer.height/2},local=rotateGraphicVector(point,center,-(layer.rotation??0));return{x:local.x-layer.x,y:local.y-layer.y};};
export const createGraphicVectorPath=(id:string,name:string,points:Point2D[],closed=true):GraphicLayer=>{const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);return{id,name,type:'vector',visible:true,locked:false,opacity:1,x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top),fill:'#00f0ff22',stroke:'#00f0ff',strokeWidth:2,path:{closed,points:points.map((p,index)=>({id:`${id}_p${index}`,x:p.x-left,y:p.y-top}))}};};
export const moveGraphicPathPoint=(document:MioGraphicDocument,layerId:string,pointId:string,point:Point2D):MioGraphicDocument=>({...document,layers:document.layers.map(layer=>layer.id!==layerId||layer.locked||!layer.path?layer:{...layer,path:{...layer.path,points:layer.path.points.map(item=>item.id===pointId?{...item,x:point.x,y:point.y}:item)}})});
export const setGraphicPathPointHandles=(document:MioGraphicDocument,layerId:string,pointId:string,inHandle?:Point2D,outHandle?:Point2D):MioGraphicDocument=>({...document,layers:document.layers.map(layer=>layer.id!==layerId||layer.locked||!layer.path?layer:{...layer,path:{...layer.path,points:layer.path.points.map(item=>item.id===pointId?{...item,inX:inHandle?.x,inY:inHandle?.y,outX:outHandle?.x,outY:outHandle?.y}:item)}})});
export const toggleGraphicPathClosed=(document:MioGraphicDocument,layerId:string):MioGraphicDocument=>({...document,layers:document.layers.map(layer=>layer.id===layerId&&!layer.locked&&layer.path?{...layer,path:{...layer.path,closed:!layer.path.closed}}:layer)});

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
    fill:l.fill??'#ffffff',text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontWeight:l.fontWeight,fontStyle:l.fontStyle,textAlign:l.textAlign,lineHeight:l.lineHeight,borderRadius:l.shapeType==='circle'?Math.min(l.width,l.height)/2:0,
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
export interface GraphicResizeSession { id:string; handle:GraphicResizeHandle; start:Point2D; origin:{x:number;y:number;width:number;height:number;rotation:number}; center:Point2D; localStart:Point2D; aspectRatio:number; }

const rotateGraphicVector=(point:Point2D,center:Point2D,degrees:number):Point2D=>{const r=degrees*Math.PI/180,dx=point.x-center.x,dy=point.y-center.y,cos=Math.cos(r),sin=Math.sin(r);return{x:center.x+dx*cos-dy*sin,y:center.y+dx*sin+dy*cos};};
export const beginGraphicResize=(document:MioGraphicDocument,id:string,handle:GraphicResizeHandle,start:Point2D):GraphicResizeSession|null=>{
  const layer=document.layers.find(item=>item.id===id&&!item.locked); if(!layer)return null; const rotation=layer.rotation??0,center={x:layer.x+layer.width/2,y:layer.y+layer.height/2};
  return {id,handle,start,center,localStart:rotateGraphicVector(start,center,-rotation),origin:{x:layer.x,y:layer.y,width:layer.width,height:layer.height,rotation},aspectRatio:layer.width/Math.max(1,layer.height)};
};

export const updateGraphicResize=(document:MioGraphicDocument,session:GraphicResizeSession,pointer:Point2D,keepAspect=false,minSize=4):MioGraphicDocument=>{
  const local=rotateGraphicVector(pointer,session.center,-session.origin.rotation),dx=local.x-session.localStart.x,dy=local.y-session.localStart.y,o=session.origin;
  let left=o.x,right=o.x+o.width,top=o.y,bottom=o.y+o.height;
  if(session.handle.includes('e'))right=Math.max(left+minSize,right+dx); if(session.handle.includes('w'))left=Math.min(right-minSize,left+dx);
  if(session.handle.includes('s'))bottom=Math.max(top+minSize,bottom+dy); if(session.handle.includes('n'))top=Math.min(bottom-minSize,top+dy);
  let width=right-left,height=bottom-top;
  if(keepAspect){const horizontal=session.handle==='e'||session.handle==='w'; if(horizontal)height=Math.max(minSize,width/session.aspectRatio);else width=Math.max(minSize,height*session.aspectRatio); if(session.handle.includes('w'))left=right-width;else right=left+width;if(session.handle.includes('n'))top=bottom-height;else bottom=top+height;}
  const localCenter={x:(left+right)/2,y:(top+bottom)/2},worldCenter=rotateGraphicVector(localCenter,session.center,o.rotation); width=right-left;height=bottom-top;
  return {...document,layers:document.layers.map(layer=>layer.id===session.id?{...layer,x:worldCenter.x-width/2,y:worldCenter.y-height/2,width,height}:layer)};
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
export interface GraphicLayerHandlePoints { resize:Record<GraphicResizeHandle,Point2D>; rotation:Point2D; }
export const getGraphicLayerHandlePoints=(layer:GraphicLayer,rotationOffset=28):GraphicLayerHandlePoints=>{
  const [nw,ne,se,sw]=getGraphicLayerCorners(layer); const midpoint=(a:Point2D,b:Point2D):Point2D=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const n=midpoint(nw,ne),e=midpoint(ne,se),s=midpoint(sw,se),w=midpoint(nw,sw); const cx=layer.x+layer.width/2,cy=layer.y+layer.height/2;
  const vx=n.x-cx,vy=n.y-cy,length=Math.max(1,Math.hypot(vx,vy));
  return {resize:{nw,n,ne,e,se,s,sw,w},rotation:{x:n.x+vx/length*rotationOffset,y:n.y+vy/length*rotationOffset}};
};

export const getGraphicSelectionBounds=(document:MioGraphicDocument,ids:string[]):GraphicSelectionBounds|null=>{
  const points=document.layers.filter(layer=>ids.includes(layer.id)&&layer.visible).flatMap(getGraphicLayerCorners); if(!points.length)return null;
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  return {left,top,right,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
};


export interface GraphicGroupResizeSession { ids:string[]; handle:GraphicResizeHandle; bounds:GraphicSelectionBounds; origins:Record<string,{x:number;y:number;width:number;height:number}>; }
export const beginGraphicGroupResize=(document:MioGraphicDocument,ids:string[],handle:GraphicResizeHandle='se'):GraphicGroupResizeSession|null=>{
  const unlocked=ids.filter(id=>document.layers.some(layer=>layer.id===id&&!layer.locked)); const selection=getGraphicSelectionBounds(document,unlocked); if(!selection||unlocked.length<2)return null;
  return {ids:unlocked,handle,bounds:selection,origins:Object.fromEntries(document.layers.filter(layer=>unlocked.includes(layer.id)).map(layer=>[layer.id,{x:layer.x,y:layer.y,width:layer.width,height:layer.height}]))};
};
export const updateGraphicGroupResize=(document:MioGraphicDocument,session:GraphicGroupResizeSession,pointer:Point2D,keepAspect=false,minSize=4):MioGraphicDocument=>{
  const b=session.bounds,h=session.handle; let left=b.left,right=b.right,top=b.top,bottom=b.bottom;
  if(h.includes('w'))left=Math.min(pointer.x,right-minSize); if(h.includes('e'))right=Math.max(pointer.x,left+minSize); if(h.includes('n'))top=Math.min(pointer.y,bottom-minSize); if(h.includes('s'))bottom=Math.max(pointer.y,top+minSize);
  let width=right-left,height=bottom-top;if(keepAspect){const ratio=b.width/Math.max(1,b.height);if(Math.abs(width-b.width)>=Math.abs(height-b.height)){height=width/ratio;if(h.includes('n'))top=bottom-height;else bottom=top+height;}else{width=height*ratio;if(h.includes('w'))left=right-width;else right=left+width;}}
  const sx=width/Math.max(1,b.width),sy=height/Math.max(1,b.height);
  return {...document,layers:document.layers.map(layer=>{const o=session.origins[layer.id];if(!o)return layer;return {...layer,x:left+(o.x-b.left)*sx,y:top+(o.y-b.top)*sy,width:Math.max(minSize,o.width*sx),height:Math.max(minSize,o.height*sy)};})};
};



export interface GraphicDragSmartSnapResult { pointer:Point2D; guides:GraphicSmartGuide[]; delta:Point2D; }
export const snapGraphicDragToSmartGuides=(document:MioGraphicDocument,session:GraphicDragSession,pointer:Point2D,tolerance=6):GraphicDragSmartSnapResult=>{
  const movingIds=session.ids.filter(id=>session.origins[id]); const startBounds=getGraphicSelectionBounds(document,movingIds); if(!startBounds)return {pointer,guides:[],delta:{x:0,y:0}};
  const rawDx=pointer.x-session.start.x,rawDy=pointer.y-session.start.y;
  const xCandidates:GraphicSmartGuide[]=[{axis:'x',value:0,source:'canvas'},{axis:'x',value:document.width/2,source:'canvas'},{axis:'x',value:document.width,source:'canvas'}];
  const yCandidates:GraphicSmartGuide[]=[{axis:'y',value:0,source:'canvas'},{axis:'y',value:document.height/2,source:'canvas'},{axis:'y',value:document.height,source:'canvas'}];
  for(const layer of document.layers){if(!layer.visible||movingIds.includes(layer.id))continue;const b=getGraphicSelectionBounds(document,[layer.id]);if(!b)continue;xCandidates.push({axis:'x',value:b.left,source:'layer'},{axis:'x',value:b.centerX,source:'layer'},{axis:'x',value:b.right,source:'layer'});yCandidates.push({axis:'y',value:b.top,source:'layer'},{axis:'y',value:b.centerY,source:'layer'},{axis:'y',value:b.bottom,source:'layer'});}
  const choose=(anchors:number[],candidates:GraphicSmartGuide[])=>anchors.flatMap(anchor=>candidates.map(guide=>({guide,adjustment:guide.value-anchor,distance:Math.abs(guide.value-anchor)}))).filter(item=>item.distance<=tolerance).sort((a,b)=>a.distance-b.distance||a.guide.value-b.guide.value)[0];
  const sx=choose([startBounds.left+rawDx,startBounds.centerX+rawDx,startBounds.right+rawDx],xCandidates),sy=choose([startBounds.top+rawDy,startBounds.centerY+rawDy,startBounds.bottom+rawDy],yCandidates);
  const dx=sx?.adjustment??0,dy=sy?.adjustment??0; return {pointer:{x:pointer.x+dx,y:pointer.y+dy},guides:[sx?.guide,sy?.guide].filter(Boolean) as GraphicSmartGuide[],delta:{x:dx,y:dy}};
};
export interface GraphicSmartGuide { axis:'x'|'y'; value:number; source:'canvas'|'layer'; }
export interface GraphicSmartSnapResult { point:Point2D; guides:GraphicSmartGuide[]; }
export const snapGraphicPointToSmartGuides=(document:MioGraphicDocument,point:Point2D,excludeIds:string[]=[],tolerance=6):GraphicSmartSnapResult=>{
  const xCandidates:GraphicSmartGuide[]=[{axis:'x',value:0,source:'canvas'},{axis:'x',value:document.width/2,source:'canvas'},{axis:'x',value:document.width,source:'canvas'}];
  const yCandidates:GraphicSmartGuide[]=[{axis:'y',value:0,source:'canvas'},{axis:'y',value:document.height/2,source:'canvas'},{axis:'y',value:document.height,source:'canvas'}];
  for(const layer of document.layers){if(!layer.visible||excludeIds.includes(layer.id))continue;const b=getGraphicSelectionBounds(document,[layer.id]);if(!b)continue;xCandidates.push({axis:'x',value:b.left,source:'layer'},{axis:'x',value:b.centerX,source:'layer'},{axis:'x',value:b.right,source:'layer'});yCandidates.push({axis:'y',value:b.top,source:'layer'},{axis:'y',value:b.centerY,source:'layer'},{axis:'y',value:b.bottom,source:'layer'});}
  const nearest=(value:number,candidates:GraphicSmartGuide[])=>candidates.map(guide=>({guide,distance:Math.abs(guide.value-value)})).filter(item=>item.distance<=tolerance).sort((a,b)=>a.distance-b.distance||a.guide.value-b.guide.value)[0]?.guide;
  const gx=nearest(point.x,xCandidates),gy=nearest(point.y,yCandidates);return {point:{x:gx?.value??point.x,y:gy?.value??point.y},guides:[gx,gy].filter(Boolean) as GraphicSmartGuide[]};
};
