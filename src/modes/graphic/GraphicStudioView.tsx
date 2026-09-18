import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Circle, Copy, Download, Eye, EyeOff, Lock, Palette, Square, Trash2, Type, Unlock } from 'lucide-react';
import { MioGraphicDocument, GraphicLayer } from '../../types/creative';
import { ExportManager } from '../../project/ExportManager';
import { eventBus } from '../../core/EventBus';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';
import { alignGraphicLayers, beginGraphicDrag, beginGraphicResize, beginGraphicRotation, beginGraphicGroupResize, deleteGraphicLayers, distributeGraphicLayers, duplicateGraphicLayers, hitTestGraphicLayers, nudgeGraphicLayers, setGraphicLayerOrder, toggleGraphicSelection, updateGraphicDrag, updateGraphicResize, updateGraphicRotation, updateGraphicGroupResize, getGraphicSelectionBounds, getGraphicLayerHandlePoints, snapGraphicDragToSmartGuides, moveGraphicPathPoint, setGraphicPathPointHandles, setGraphicPathNodeType, setGraphicSmoothPathHandle, addGraphicPathPoint, deleteGraphicPathPoint, beginGraphicPenPath, appendGraphicPenPoint, finishGraphicPenPath, graphicLayerLocalToWorld, graphicLayerWorldToLocal, type GraphicSmartGuide, type GraphicDragSession, type GraphicResizeHandle, type GraphicResizeSession, type GraphicRotationSession, type GraphicGroupResizeSession } from '../../creative/GraphicMotionWorkspace';

const activityTimestamp = () => Date.now();

const INITIAL_GRAPHIC_DOCUMENT: MioGraphicDocument = {
  width: 600,
  height: 700,
  backgroundColor: '#07090e',
  layers: [
    { id: 'layer_frame', name: 'Technical Grid Frame', type: 'shape', shapeType: 'rectangle', visible: true, locked: true, opacity: 1, x: 20, y: 20, width: 560, height: 660, stroke: '#00f0ff', strokeWidth: 2, fill: '#0a0f1d' },
    { id: 'layer_accent', name: 'Core Accent', type: 'shape', shapeType: 'circle', visible: true, locked: false, opacity: 0.8, x: 300, y: 260, width: 140, height: 140, fill: '#00f0ff22', stroke: '#00f0ff', strokeWidth: 3 },
    { id: 'layer_title', name: 'Title Typography', type: 'text', visible: true, locked: false, opacity: 1, x: 50, y: 80, width: 500, height: 40, text: 'MIO // TECHNOLOGY PREVIEW', fontSize: 24, fontFamily: 'monospace', fill: '#00f0ff' },
    { id: 'layer_subtitle', name: 'Sub-header', type: 'text', visible: true, locked: false, opacity: 0.85, x: 50, y: 120, width: 500, height: 30, text: 'LOCAL GRAPHIC COMPOSITION WORKSPACE', fontSize: 14, fontFamily: 'monospace', fill: '#94a3b8' },
  ],
};

export const GraphicStudioView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspace = useCreativeStudioDocument<MioGraphicDocument>('MIO_Graphic.mioart', INITIAL_GRAPHIC_DOCUMENT);
  const { state: documentData, setState: setDocumentData } = workspace;
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(['layer_title']);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [smartGuides, setSmartGuides] = useState<GraphicSmartGuide[]>([]);
  const [penMode,setPenMode]=useState(false); const [activePenLayerId,setActivePenLayerId]=useState(''); const [nodeEditMode,setNodeEditMode]=useState(false); const [selectedPathPointId,setSelectedPathPointId]=useState<string>(''); const [activeBezierHandle,setActiveBezierHandle]=useState<'in'|'out'|null>(null);
  const dragSessionRef = useRef<GraphicDragSession | null>(null);
  const resizeSessionRef = useRef<GraphicResizeSession | null>(null);
  const rotationSessionRef = useRef<GraphicRotationSession | null>(null);
  const groupResizeSessionRef = useRef<GraphicGroupResizeSession | null>(null);
  const selectedLayerId = selectedLayerIds.at(-1) ?? '';
  const selectedLayer = documentData.layers.find((layer) => layer.id === selectedLayerId);
  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const resizeHandles = (layer: GraphicLayer) => { const handles=getGraphicLayerHandlePoints(layer).resize; return (Object.entries(handles) as [GraphicResizeHandle,{x:number;y:number}][]).map(([handle,point])=>[handle,point.x,point.y] as const); };
  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { const penPoint=canvasPoint(event); if(penMode){if(!activePenLayerId){const started=beginGraphicPenPath(documentData,penPoint);setDocumentData(started.document);setActivePenLayerId(started.layerId);setSelectedLayerIds([started.layerId]);}else{const active=documentData.layers.find(layer=>layer.id===activePenLayerId);const first=active?.path?.points[0];if(first&&active.path!.points.length>=3&&Math.hypot(penPoint.x-(active.x+first.x),penPoint.y-(active.y+first.y))<=10){setDocumentData(previous=>finishGraphicPenPath(previous,activePenLayerId,true));setActivePenLayerId('');}else{const local=active?graphicLayerWorldToLocal(active,penPoint):penPoint;setDocumentData(previous=>appendGraphicPenPoint(previous,activePenLayerId,local).document);}}return;}
    const point=canvasPoint(event);
    if(nodeEditMode&&selectedLayer?.type==='vector'&&selectedLayer.path&&!selectedLayer.locked){const local=graphicLayerWorldToLocal(selectedLayer,point),selected=selectedLayer.path.points.find(p=>p.id===selectedPathPointId);if(selected){const handles=[['in',selected.inX,selected.inY],['out',selected.outX,selected.outY]] as const;const hh=handles.find(([,x,y])=>x!==undefined&&y!==undefined&&Math.hypot(local.x-x,local.y-y)<=9);if(hh){setActiveBezierHandle(hh[0]);event.currentTarget.setPointerCapture(event.pointerId);return;}}const hit=selectedLayer.path.points.find(p=>Math.hypot(local.x-p.x,local.y-p.y)<=9);if(hit){setSelectedPathPointId(hit.id);if(event.altKey){const offset={x:local.x+32,y:local.y};setDocumentData(previous=>hit.nodeType==='smooth'?setGraphicSmoothPathHandle(previous,selectedLayer.id,hit.id,'out',offset):setGraphicPathPointHandles(previous,selectedLayer.id,hit.id,hit.inX!==undefined&&hit.inY!==undefined?{x:hit.inX,y:hit.inY}:undefined,offset));setActiveBezierHandle('out');}event.currentTarget.setPointerCapture(event.pointerId);return;}}
    const groupBounds=selectedLayerIds.length>1?getGraphicSelectionBounds(documentData,selectedLayerIds):null;
    if(groupBounds){const handles=[['nw',groupBounds.left,groupBounds.top],['n',groupBounds.centerX,groupBounds.top],['ne',groupBounds.right,groupBounds.top],['e',groupBounds.right,groupBounds.centerY],['se',groupBounds.right,groupBounds.bottom],['s',groupBounds.centerX,groupBounds.bottom],['sw',groupBounds.left,groupBounds.bottom],['w',groupBounds.left,groupBounds.centerY]] as const;const gh=handles.find(([,x,y])=>Math.abs(point.x-x)<=8&&Math.abs(point.y-y)<=8);if(gh){groupResizeSessionRef.current=beginGraphicGroupResize(documentData,selectedLayerIds,gh[0]);event.currentTarget.setPointerCapture(event.pointerId);return;}}
    if(selectedLayer && !selectedLayer.locked){ const rotatePoint=getGraphicLayerHandlePoints(selectedLayer).rotation; if(Math.hypot(point.x-rotatePoint.x,point.y-rotatePoint.y)<=10){rotationSessionRef.current=beginGraphicRotation(documentData,selectedLayer.id,point);event.currentTarget.setPointerCapture(event.pointerId);return;} const handle=resizeHandles(selectedLayer).find(([,x,y])=>Math.abs(point.x-x)<=8&&Math.abs(point.y-y)<=8); if(handle){resizeSessionRef.current=beginGraphicResize(documentData,selectedLayer.id,handle[0] as GraphicResizeHandle,point);event.currentTarget.setPointerCapture(event.pointerId);return;} }
    const hit=hitTestGraphicLayers(documentData,point)[0];
    if(!hit){setSelectedLayerIds([]);return;}
    const next=toggleGraphicSelection(selectedLayerIds,hit,event.shiftKey); setSelectedLayerIds(next);
    dragSessionRef.current=beginGraphicDrag(documentData,next,point,8,snapEnabled); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point=canvasPoint(event);
    if(nodeEditMode&&selectedLayer?.type==='vector'&&selectedPathPointId&&event.currentTarget.hasPointerCapture(event.pointerId)){const local=graphicLayerWorldToLocal(selectedLayer,point);if(activeBezierHandle){const node=selectedLayer.path?.points.find(p=>p.id===selectedPathPointId);if(node)setDocumentData(previous=>node.nodeType==='smooth'?setGraphicSmoothPathHandle(previous,selectedLayer.id,selectedPathPointId,activeBezierHandle,local):setGraphicPathPointHandles(previous,selectedLayer.id,selectedPathPointId,activeBezierHandle==='in'?local:(node.inX!==undefined&&node.inY!==undefined?{x:node.inX,y:node.inY}:undefined),activeBezierHandle==='out'?local:(node.outX!==undefined&&node.outY!==undefined?{x:node.outX,y:node.outY}:undefined)));return;}setDocumentData(previous=>moveGraphicPathPoint(previous,selectedLayer.id,selectedPathPointId,local));return;}
    if(groupResizeSessionRef.current){const s=groupResizeSessionRef.current;setDocumentData(previous=>updateGraphicGroupResize(previous,s,point,event.shiftKey));return;}
    if(dragSessionRef.current&&snapEnabled){const snapped=snapGraphicDragToSmartGuides(documentData,dragSessionRef.current,point,6);setSmartGuides(snapped.guides);setDocumentData(previous=>updateGraphicDrag(previous,dragSessionRef.current!,snapped.pointer));return;}
    if(rotationSessionRef.current){setDocumentData(previous=>updateGraphicRotation(previous,rotationSessionRef.current!,point,event.shiftKey?15:0));return;}
    if(resizeSessionRef.current){setDocumentData(previous=>updateGraphicResize(previous,resizeSessionRef.current!,point,event.shiftKey));return;}
    if(!dragSessionRef.current)return;
    setDocumentData(previous=>updateGraphicDrag(previous,dragSessionRef.current!,point));
  };
  const onCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => { dragSessionRef.current=null; setActiveBezierHandle(null); resizeSessionRef.current=null; rotationSessionRef.current=null; groupResizeSessionRef.current=null; setSmartGuides([]); if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId); };
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape'&&activePenLayerId){setDocumentData(previous=>finishGraphicPenPath(previous,activePenLayerId,false));setActivePenLayerId('');return;}if(!selectedLayerIds.length||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return; const step=event.shiftKey?10:1; const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0; const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0; event.preventDefault();setDocumentData(previous=>nudgeGraphicLayers(previous,selectedLayerIds,dx,dy));};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[selectedLayerIds,setDocumentData,activePenLayerId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = documentData.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    for (const layer of documentData.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      const cx=layer.x+layer.width/2,cy=layer.y+layer.height/2; if(layer.rotation){ctx.translate(cx,cy);ctx.rotate(layer.rotation*Math.PI/180);ctx.translate(-cx,-cy);}
      if (layer.type === 'vector' && layer.path && layer.path.points.length) {
        const points=layer.path.points; ctx.beginPath(); ctx.moveTo(layer.x+points[0].x,layer.y+points[0].y);
        for(let index=1;index<points.length;index++){const previous=points[index-1],current=points[index]; const hasCurve=previous.outX!==undefined||previous.outY!==undefined||current.inX!==undefined||current.inY!==undefined; if(hasCurve)ctx.bezierCurveTo(layer.x+(previous.outX??previous.x),layer.y+(previous.outY??previous.y),layer.x+(current.inX??current.x),layer.y+(current.inY??current.y),layer.x+current.x,layer.y+current.y);else ctx.lineTo(layer.x+current.x,layer.y+current.y);}
        if(layer.path.closed){const last=points.at(-1)!;const first=points[0],hasCurve=last.outX!==undefined||last.outY!==undefined||first.inX!==undefined||first.inY!==undefined;if(hasCurve)ctx.bezierCurveTo(layer.x+(last.outX??last.x),layer.y+(last.outY??last.y),layer.x+(first.inX??first.x),layer.y+(first.inY??first.y),layer.x+first.x,layer.y+first.y);ctx.closePath();}
        if(layer.fill&&layer.path.closed){ctx.fillStyle=layer.fill;ctx.fill();} if(layer.stroke){ctx.strokeStyle=layer.stroke;ctx.lineWidth=layer.strokeWidth||1;ctx.stroke();}
      } else if (layer.type === 'shape' && layer.shapeType === 'rectangle') {
        if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fillRect(layer.x, layer.y, layer.width, layer.height); }
        if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth || 1; ctx.strokeRect(layer.x, layer.y, layer.width, layer.height); }
      } else if (layer.type === 'shape' && layer.shapeType === 'circle') {
        ctx.beginPath(); ctx.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
        if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(); }
        if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth || 1; ctx.stroke(); }
      } else if (layer.type === 'text') {
        ctx.fillStyle = layer.fill || '#ffffff';
        ctx.font = `${layer.fontStyle || 'normal'} ${layer.fontWeight || 400} ${layer.fontSize || 16}px ${layer.fontFamily || 'monospace'}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = layer.textAlign || 'left';
        const lineHeight=(layer.lineHeight || 1.2)*(layer.fontSize || 16), anchorX=layer.textAlign==='center'?layer.x+layer.width/2:layer.textAlign==='right'?layer.x+layer.width:layer.x;
        (layer.text || '').split('\\n').forEach((line,index)=>ctx.fillText(line,anchorX,layer.y+index*lineHeight));
      }
      if(nodeEditMode&&selectedLayerId===layer.id&&layer.type==='vector'&&layer.path){ctx.setLineDash([]);for(const point of layer.path.points){const world=graphicLayerLocalToWorld(layer,point),px=world.x,py=world.y;ctx.fillStyle=point.id===selectedPathPointId?'#f472b6':'#e2e8f0';ctx.strokeStyle='#0284c7';ctx.fillRect(px-4,py-4,8,8);ctx.strokeRect(px-4,py-4,8,8);if(point.id===selectedPathPointId){for(const h of [{x:point.inX,y:point.inY},{x:point.outX,y:point.outY}])if(h.x!==undefined&&h.y!==undefined){const hw=graphicLayerLocalToWorld(layer,{x:h.x,y:h.y});ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(hw.x,hw.y);ctx.stroke();ctx.beginPath();ctx.arc(hw.x,hw.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();}}}}
      if (selectedLayerIds.includes(layer.id)) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.strokeRect(layer.x - 4, layer.y - 4, layer.width + 8, (layer.height || layer.fontSize || 20) + 8);
        if(!layer.locked){ctx.setLineDash([]);ctx.fillStyle='#e2e8f0';for(const [,hx,hy] of resizeHandles(layer)){ctx.fillRect(hx-4,hy-4,8,8);ctx.strokeStyle='#0284c7';ctx.strokeRect(hx-4,hy-4,8,8);} const rx=layer.x+layer.width/2,ry=layer.y-28;ctx.beginPath();ctx.moveTo(rx,layer.y-4);ctx.lineTo(rx,ry+6);ctx.stroke();ctx.beginPath();ctx.arc(rx,ry,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    for(const guide of smartGuides){ctx.save();ctx.strokeStyle='#f472b6';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();if(guide.axis==='x'){ctx.moveTo(guide.value,0);ctx.lineTo(guide.value,canvas.height);}else{ctx.moveTo(0,guide.value);ctx.lineTo(canvas.width,guide.value);}ctx.stroke();ctx.restore();}
    const groupBounds=selectedLayerIds.length>1?getGraphicSelectionBounds(documentData,selectedLayerIds):null;
    if(groupBounds){ctx.save();ctx.strokeStyle='#38bdf8';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.strokeRect(groupBounds.left,groupBounds.top,groupBounds.width,groupBounds.height);ctx.setLineDash([]);ctx.fillStyle='#e2e8f0';ctx.strokeStyle='#0284c7';for(const [hx,hy] of [[groupBounds.left,groupBounds.top],[groupBounds.centerX,groupBounds.top],[groupBounds.right,groupBounds.top],[groupBounds.right,groupBounds.centerY],[groupBounds.right,groupBounds.bottom],[groupBounds.centerX,groupBounds.bottom],[groupBounds.left,groupBounds.bottom],[groupBounds.left,groupBounds.centerY]]){ctx.fillRect(hx-5,hy-5,10,10);ctx.strokeRect(hx-5,hy-5,10,10);}ctx.restore();}
  }, [documentData, selectedLayerIds, smartGuides]);

  const updateSelectedLayer = (updates: Partial<GraphicLayer>) => {
    if (!selectedLayerId) return;
    setDocumentData((previous) => ({ ...previous, layers: previous.layers.map((layer) => layer.id === selectedLayerId ? { ...layer, ...updates } : layer) }));
  };

  const addLayer = (type: 'shape' | 'text', shapeType: 'rectangle' | 'circle' = 'rectangle') => {
    const sequence = documentData.layers.length + 1;
    const layer: GraphicLayer = {
      id: `layer_${type}_${shapeType}_${sequence}`,
      name: type === 'text' ? `Text Layer ${sequence}` : `${shapeType} ${sequence}`,
      type,
      shapeType: type === 'shape' ? shapeType : undefined,
      visible: true,
      locked: false,
      opacity: 1,
      x: 120,
      y: 180,
      width: type === 'text' ? 320 : 140,
      height: type === 'text' ? 40 : 140,
      fill: type === 'text' ? '#ffffff' : '#00f0ff22',
      stroke: type === 'shape' ? '#00f0ff' : undefined,
      strokeWidth: type === 'shape' ? 2 : undefined,
      text: type === 'text' ? 'New text' : undefined,
      fontSize: type === 'text' ? 20 : undefined,
      fontFamily: type === 'text' ? 'monospace' : undefined,
    };
    setDocumentData((previous) => ({ ...previous, layers: [...previous.layers, layer] }));
    setSelectedLayerIds([layer.id]);
    eventBus.emit('ACTIVITY_LOG', { timestamp: activityTimestamp(), message: `Added local graphic layer: ${layer.name}`, mode: 'GRAPHIC' });
  };

  const deleteSelected = () => {
    if (!selectedLayer || selectedLayer.locked) return;
    setDocumentData((previous) => ({ ...previous, layers: previous.layers.filter((layer) => layer.id !== selectedLayer.id) }));
    setSelectedLayerIds(documentData.layers.find((layer) => layer.id !== selectedLayer.id)?.id ? [documentData.layers.find((layer) => layer.id !== selectedLayer.id)!.id] : []);
  };

  const duplicateSelected = () => {
    if (!selectedLayer) return;
    const duplicate: GraphicLayer = { ...structuredClone(selectedLayer), id: `${selectedLayer.id}_copy_${Date.now().toString(36)}`, name: `${selectedLayer.name} Copy`, x: selectedLayer.x + 16, y: selectedLayer.y + 16, locked: false };
    setDocumentData((previous) => ({ ...previous, layers: [...previous.layers, duplicate] }));
    setSelectedLayerIds([duplicate.id]);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selectedLayer) return;
    setDocumentData((previous) => {
      const index = previous.layers.findIndex((layer) => layer.id === selectedLayer.id);
      const target = Math.max(0, Math.min(previous.layers.length - 1, index + direction));
      if (index === target) return previous;
      const layers = [...previous.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { ...previous, layers };
    });
  };

  return (
    <div className="relative flex h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <CreativeWorkspaceToolbar workspace={workspace} /><button onClick={()=>{setPenMode(value=>!value);setActivePenLayerId('');setNodeEditMode(false);}} className={`rounded border px-2 py-1 text-xs ${penMode?'border-cyan-400 text-cyan-300':'border-gray-700 text-gray-400'}`}>PEN</button>
        {selectedLayer?.type==='vector'&&<button onClick={()=>{setNodeEditMode(value=>!value);setSelectedPathPointId('');}} className={`rounded border px-2 py-1 text-xs ${nodeEditMode?'border-pink-400 text-pink-300':'border-gray-700 text-gray-400'}`}>NODE EDIT</button>}{nodeEditMode&&selectedLayer?.type==='vector'&&selectedPathPointId&&<div className="flex gap-1">{(['corner','smooth'] as const).map(mode=><button key={mode} onClick={()=>setDocumentData(previous=>setGraphicPathNodeType(previous,selectedLayer.id,selectedPathPointId,mode))} className={`rounded border border-gray-700 px-2 py-1 text-[10px] uppercase ${selectedLayer.path?.points.find(p=>p.id===selectedPathPointId)?.nodeType===mode?'text-pink-300':'text-gray-400'}`}>{mode}</button>)}<button onClick={()=>{const anchor=selectedLayer.path?.points.find(p=>p.id===selectedPathPointId);if(!anchor)return;setDocumentData(previous=>addGraphicPathPoint(previous,selectedLayer.id,{x:anchor.x+24,y:anchor.y+24},selectedPathPointId));}} className="rounded border border-gray-700 px-2 py-1 text-[10px] text-cyan-300">+ NODE</button><button onClick={()=>{setDocumentData(previous=>deleteGraphicPathPoint(previous,selectedLayer.id,selectedPathPointId));setSelectedPathPointId('');}} className="rounded border border-gray-700 px-2 py-1 text-[10px] text-red-300">− NODE</button><span className="px-1 text-[10px] text-gray-500">Alt+drag anchor: create curve handle</span></div>}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3">
          <div className="flex items-center gap-2 text-cyan-300"><Palette size={15} /><span className="font-bold">GRAPHIC WORKSPACE // LOCAL CANVAS COMPOSITION</span><span className="text-[10px] text-amber-300">RIGHTS NOT ASSESSED</span></div>
          <div className="flex gap-2"><button onClick={() => setSnapEnabled(value=>!value)} className={`rounded border px-2 py-1 ${snapEnabled?'border-cyan-500 text-cyan-300':'border-gray-700 text-gray-500'}`}>SNAP {snapEnabled?'ON':'OFF'}</button><button disabled={selectedLayerIds.length<2} onClick={()=>setDocumentData(previous=>alignGraphicLayers(previous,selectedLayerIds,'centerX'))} className="rounded border border-gray-700 px-2 py-1 disabled:opacity-30">Align X</button><button disabled={selectedLayerIds.length<2} onClick={()=>setDocumentData(previous=>alignGraphicLayers(previous,selectedLayerIds,'centerY'))} className="rounded border border-gray-700 px-2 py-1 disabled:opacity-30">Align Y</button><button disabled={selectedLayerIds.length<3} onClick={()=>setDocumentData(previous=>distributeGraphicLayers(previous,selectedLayerIds,'horizontal'))} className="rounded border border-gray-700 px-2 py-1 disabled:opacity-30">Distribute</button><button onClick={() => addLayer('shape', 'rectangle')} className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-cyan-300"><Square size={12} />Rectangle</button><button onClick={() => addLayer('shape', 'circle')} className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-cyan-300"><Circle size={12} />Circle</button><button onClick={() => addLayer('text')} className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-cyan-300"><Type size={12} />Text</button><button onClick={() => canvasRef.current && void ExportManager.exportCanvasAsPNG(canvasRef.current, 'MIO_Graphic.png')} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black"><Download size={12} />PNG</button></div>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto rounded-xl border border-gray-800 bg-[#090d16] p-4"><canvas ref={canvasRef} width={documentData.width} height={documentData.height} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerUp} className="max-h-full max-w-full touch-none cursor-crosshair border border-cyan-500/20 bg-black shadow-2xl" /></div>
      </div>

      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 p-4 overflow-y-auto space-y-4">
        <div><span className="text-gray-300 font-bold">LAYERS ({documentData.layers.length})</span><div className="mt-2 space-y-1">{[...documentData.layers].reverse().map((layer) => <div key={layer.id} onClick={(event) => setSelectedLayerIds(toggleGraphicSelection(selectedLayerIds, layer.id, event.shiftKey))} className={`flex items-center justify-between rounded border px-2 py-2 cursor-pointer ${selectedLayerIds.includes(layer.id) ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300' : 'border-gray-800 bg-[#111726] text-gray-400'}`}><span className="truncate">{layer.name}</span><div className="flex items-center gap-1"><button onClick={(event) => { event.stopPropagation(); setDocumentData((previous) => ({ ...previous, layers: previous.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, visible: !candidate.visible } : candidate) })); }}>{layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button><button onClick={(event) => { event.stopPropagation(); setDocumentData((previous) => ({ ...previous, layers: previous.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, locked: !candidate.locked } : candidate) })); }}>{layer.locked ? <Lock size={11} /> : <Unlock size={11} />}</button></div></div>)}</div></div>
        {selectedLayer && <div className="space-y-3 border-t border-gray-800 pt-3"><div className="flex items-center justify-between"><span className="font-bold text-cyan-300">SELECTED LAYER</span><div className="flex gap-2"><button onClick={() => moveSelected(1)} title="Bring forward"><ArrowUp size={13} /></button><button onClick={() => moveSelected(-1)} title="Send backward"><ArrowDown size={13} /></button><button onClick={duplicateSelected} title="Duplicate"><Copy size={13} /></button><button disabled={selectedLayer.locked} onClick={deleteSelected} className="text-red-400 disabled:opacity-30"><Trash2 size={13} /></button></div></div><input value={selectedLayer.name} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ name: event.target.value })} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white disabled:opacity-50" />{selectedLayer.type === 'text' && <><textarea value={selectedLayer.text || ''} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ text: event.target.value })} className="w-full rounded border border-gray-700 bg-[#141b2b] p-2 text-white disabled:opacity-50" /><div className="grid grid-cols-2 gap-2"><label className="text-[9px] uppercase text-gray-500">Font size<input type="number" min="4" value={selectedLayer.fontSize || 16} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ fontSize: Math.max(4, parseInt(event.target.value) || 16) })} className="mt-1 w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white disabled:opacity-50" /></label><label className="text-[9px] uppercase text-gray-500">Font family<select value={selectedLayer.fontFamily || 'monospace'} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ fontFamily: event.target.value })} className="mt-1 w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white disabled:opacity-50"><option value="monospace">Monospace</option><option value="sans-serif">Sans Serif</option><option value="serif">Serif</option><option value="system-ui">System UI</option></select></label></div><div className="grid grid-cols-2 gap-2"><label className="text-[9px] uppercase text-gray-500">Weight<select value={String(selectedLayer.fontWeight || 400)} disabled={selectedLayer.locked} onChange={(event)=>updateSelectedLayer({fontWeight:Number(event.target.value)})} className="mt-1 w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white disabled:opacity-50"><option value="300">Light</option><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semi Bold</option><option value="700">Bold</option></select></label><label className="text-[9px] uppercase text-gray-500">Line height<input type="number" min="0.8" max="3" step="0.1" value={selectedLayer.lineHeight || 1.2} disabled={selectedLayer.locked} onChange={(event)=>updateSelectedLayer({lineHeight:Math.max(.8,Math.min(3,Number(event.target.value)||1.2))})} className="mt-1 w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white disabled:opacity-50"/></label></div><div className="flex gap-1"><button disabled={selectedLayer.locked} onClick={()=>updateSelectedLayer({fontStyle:selectedLayer.fontStyle==='italic'?'normal':'italic'})} className="rounded border border-gray-700 px-2 py-1 disabled:opacity-50">Italic</button>{(['left','center','right'] as const).map(align=><button key={align} disabled={selectedLayer.locked} onClick={()=>updateSelectedLayer({textAlign:align})} className={`rounded border px-2 py-1 disabled:opacity-50 ${selectedLayer.textAlign===align?'border-cyan-400 text-cyan-300':'border-gray-700'}`}>{align}</button>)}</div></>}<div><span className="text-[10px] text-gray-500">OPACITY {Math.round(selectedLayer.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={selectedLayer.opacity} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ opacity: parseFloat(event.target.value) })} className="w-full accent-cyan-400 disabled:opacity-50" /></div><div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map((field) => <label key={field} className="text-[9px] uppercase text-gray-500">{field}<input type="number" value={selectedLayer[field]} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ [field]: parseInt(event.target.value) || 0 })} className="mt-1 w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white disabled:opacity-50" /></label>)}</div><label className="flex items-center gap-2 text-gray-500">FILL<input type="color" value={selectedLayer.fill?.slice(0, 7) || '#ffffff'} disabled={selectedLayer.locked} onChange={(event) => updateSelectedLayer({ fill: event.target.value })} /></label></div>}
      </div>
    </div>
  );
};
