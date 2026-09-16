import React, { useEffect, useRef, useState } from 'react';
import { Brush, Download, Eraser, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { eventBus } from '../../core/EventBus';
import { ExportManager } from '../../project/ExportManager';
import type { DrawingStroke, MioDrawingDocument } from '../../types/creative';

const INITIAL_DRAWING: MioDrawingDocument = {
  width: 900,
  height: 700,
  backgroundColor: '#f8fafc',
  layers: [{ id: 'draw_layer_1', name: 'Sketch Layer', visible: true, locked: false, opacity: 1, strokes: [] }],
};

const drawDocument = (canvas: HTMLCanvasElement, document: MioDrawingDocument): void => {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = document.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    context.save();
    context.globalAlpha = layer.opacity;
    for (const stroke of layer.strokes) {
      if (stroke.points.length < 2) continue;
      context.globalCompositeOperation = stroke.blendMode === 'erase' ? 'destination-out' : stroke.blendMode === 'normal' ? 'source-over' : stroke.blendMode;
      context.strokeStyle = stroke.color;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = stroke.size;
      context.globalAlpha = layer.opacity * stroke.opacity;
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
  }
};

export const DrawingStudioView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const workspace = useCreativeStudioDocument<MioDrawingDocument>('MIO_Drawing.miodraw', INITIAL_DRAWING);
  const { state: drawing, setState: setDrawing } = workspace;
  const [selectedLayerId, setSelectedLayerId] = useState('draw_layer_1');
  const [brushSize, setBrushSize] = useState(8);
  const [color, setColor] = useState('#111827');
  const [eraser, setEraser] = useState(false);
  const selectedLayer = drawing.layers.find((layer) => layer.id === selectedLayerId);

  useEffect(() => { if (canvasRef.current) drawDocument(canvasRef.current, drawing); }, [drawing]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height, pressure: event.pressure || 0.5 };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selectedLayer || selectedLayer.locked || !selectedLayer.visible) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = { id: `stroke_${Date.now().toString(36)}`, points: [pointFromEvent(event)], color, size: brushSize, opacity: 1, blendMode: eraser ? 'erase' : 'normal' };
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    stroke.points.push(pointFromEvent(event));
    const canvas = canvasRef.current;
    if (canvas) drawDocument(canvas, { ...drawing, layers: drawing.layers.map((layer) => layer.id === selectedLayerId ? { ...layer, strokes: [...layer.strokes, stroke] } : layer) });
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    setDrawing((previous) => ({ ...previous, layers: previous.layers.map((layer) => layer.id === selectedLayerId ? { ...layer, strokes: [...layer.strokes, structuredClone(stroke)] } : layer) }));
  };

  const addLayer = () => {
    const id = `draw_layer_${Date.now().toString(36)}`;
    setDrawing((previous) => ({ ...previous, layers: [...previous.layers, { id, name: `Layer ${previous.layers.length + 1}`, visible: true, locked: false, opacity: 1, strokes: [] }] }));
    setSelectedLayerId(id);
    eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: 'Added local drawing layer', mode: 'DRAWING' });
  };

  const deleteLayer = () => {
    if (!selectedLayer || selectedLayer.locked || drawing.layers.length < 2) return;
    const remaining = drawing.layers.filter((layer) => layer.id !== selectedLayer.id);
    setDrawing((previous) => ({ ...previous, layers: remaining }));
    setSelectedLayerId(remaining.at(-1)?.id ?? '');
  };

  return <div className="relative flex h-full w-full overflow-hidden bg-[#07090e] font-mono text-xs">
    <CreativeWorkspaceToolbar workspace={workspace} />
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3">
        <div className="flex items-center gap-2 font-bold text-cyan-300"><Brush size={15} />DRAWING STUDIO // LOCAL RASTER STROKES</div>
        <div className="flex items-center gap-2"><button onClick={() => setEraser(false)} className={`rounded border px-2 py-1 ${!eraser ? 'border-cyan-400 bg-cyan-950 text-cyan-300' : 'border-gray-700 text-gray-400'}`}><Brush size={12} /></button><button onClick={() => setEraser(true)} className={`rounded border px-2 py-1 ${eraser ? 'border-cyan-400 bg-cyan-950 text-cyan-300' : 'border-gray-700 text-gray-400'}`}><Eraser size={12} /></button><input type="color" value={color} onChange={(event) => setColor(event.target.value)} disabled={eraser} /><input type="range" min="1" max="80" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="w-28 accent-cyan-400" /><span className="w-8 text-gray-400">{brushSize}px</span><button onClick={() => canvasRef.current && void ExportManager.exportCanvasAsPNG(canvasRef.current, 'MIO_Drawing.png', 'DRAWING')} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black"><Download size={12} />PNG</button></div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto rounded-xl border border-gray-800 bg-[#090d16] p-4"><canvas ref={canvasRef} width={drawing.width} height={drawing.height} onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} className="max-h-full max-w-full touch-none bg-white shadow-2xl" /></div>
    </div>
    <aside className="w-72 border-l border-gray-800 bg-[#0d121d] p-4"><div className="flex items-center justify-between"><span className="font-bold text-gray-300">LAYERS ({drawing.layers.length})</span><div className="flex gap-1"><button onClick={addLayer} className="text-cyan-400"><Plus size={14} /></button><button onClick={deleteLayer} disabled={!selectedLayer || selectedLayer.locked || drawing.layers.length < 2} className="text-red-400 disabled:opacity-30"><Trash2 size={14} /></button></div></div><div className="mt-3 space-y-1">{[...drawing.layers].reverse().map((layer) => <div key={layer.id} onClick={() => setSelectedLayerId(layer.id)} className={`flex cursor-pointer items-center justify-between rounded border px-2 py-2 ${layer.id === selectedLayerId ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300' : 'border-gray-800 text-gray-400'}`}><span className="truncate">{layer.name} · {layer.strokes.length}</span><div className="flex gap-2"><button onClick={(event) => { event.stopPropagation(); setDrawing((previous) => ({ ...previous, layers: previous.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) })); }}>{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button><button onClick={(event) => { event.stopPropagation(); setDrawing((previous) => ({ ...previous, layers: previous.layers.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item) })); }}>{layer.locked ? <Lock size={12} /> : <Unlock size={12} />}</button></div></div>)}</div>{selectedLayer && <div className="mt-4 border-t border-gray-800 pt-3"><input value={selectedLayer.name} onChange={(event) => setDrawing((previous) => ({ ...previous, layers: previous.layers.map((layer) => layer.id === selectedLayer.id ? { ...layer, name: event.target.value } : layer) }))} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white" /><label className="mt-3 block text-gray-500">OPACITY {Math.round(selectedLayer.opacity * 100)}%<input type="range" min="0" max="1" step="0.05" value={selectedLayer.opacity} onChange={(event) => setDrawing((previous) => ({ ...previous, layers: previous.layers.map((layer) => layer.id === selectedLayer.id ? { ...layer, opacity: Number(event.target.value) } : layer) }))} className="w-full accent-cyan-400" /></label></div>}</aside>
  </div>;
};
