import React, { useEffect, useRef, useState } from 'react';
import { Circle, Download, Eye, EyeOff, Lock, Palette, Square, Trash2, Type, Unlock } from 'lucide-react';
import { MioGraphicDocument, GraphicLayer } from '../../types/creative';
import { ExportManager } from '../../project/ExportManager';
import { eventBus } from '../../core/EventBus';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';

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
  const [selectedLayerId, setSelectedLayerId] = useState('layer_title');
  const selectedLayer = documentData.layers.find((layer) => layer.id === selectedLayerId);

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
      if (layer.type === 'shape' && layer.shapeType === 'rectangle') {
        if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fillRect(layer.x, layer.y, layer.width, layer.height); }
        if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth || 1; ctx.strokeRect(layer.x, layer.y, layer.width, layer.height); }
      } else if (layer.type === 'shape' && layer.shapeType === 'circle') {
        ctx.beginPath(); ctx.arc(layer.x, layer.y, layer.width / 2, 0, Math.PI * 2);
        if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(); }
        if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth || 1; ctx.stroke(); }
      } else if (layer.type === 'text') {
        ctx.fillStyle = layer.fill || '#ffffff';
        ctx.font = `bold ${layer.fontSize || 16}px ${layer.fontFamily || 'monospace'}`;
        ctx.fillText(layer.text || '', layer.x, layer.y);
      }
      if (layer.id === selectedLayerId) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        if (layer.shapeType === 'circle') ctx.strokeRect(layer.x - layer.width / 2 - 4, layer.y - layer.height / 2 - 4, layer.width + 8, layer.height + 8);
        else ctx.strokeRect(layer.x - 4, layer.y - 4, layer.width + 8, (layer.height || layer.fontSize || 20) + 8);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }, [documentData, selectedLayerId]);

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
    setSelectedLayerId(layer.id);
    eventBus.emit('ACTIVITY_LOG', { timestamp: activityTimestamp(), message: `Added local graphic layer: ${layer.name}`, mode: 'GRAPHIC' });
  };

  const deleteSelected = () => {
    if (!selectedLayer || selectedLayer.locked) return;
    setDocumentData((previous) => ({ ...previous, layers: previous.layers.filter((layer) => layer.id !== selectedLayer.id) }));
    setSelectedLayerId(documentData.layers.find((layer) => layer.id !== selectedLayer.id)?.id ?? '');
  };

  return (
    <div className="relative flex h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <CreativeWorkspaceToolbar workspace={workspace} />
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3">
          <div className="flex items-center gap-2 text-cyan-300"><Palette size={15} /><span className="font-bold">GRAPHIC WORKSPACE // LOCAL CANVAS COMPOSITION</span><span className="text-[10px] text-amber-300">RIGHTS NOT ASSESSED</span></div>
          <div className="flex gap-2"><button onClick={() => addLayer('shape', 'rectangle')} className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-cyan-300"><Square size={12} />Rectangle</button><button onClick={() => addLayer('shape', 'circle')} className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-cyan-300"><Circle size={12} />Circle</button><button onClick={() => addLayer('text')} className="flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-cyan-300"><Type size={12} />Text</button><button onClick={() => canvasRef.current && void ExportManager.exportCanvasAsPNG(canvasRef.current, 'MIO_Graphic.png')} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black"><Download size={12} />PNG</button></div>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto rounded-xl border border-gray-800 bg-[#090d16] p-4"><canvas ref={canvasRef} width={documentData.width} height={documentData.height} className="max-h-full max-w-full border border-cyan-500/20 bg-black shadow-2xl" /></div>
      </div>

      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 p-4 overflow-y-auto space-y-4">
        <div><span className="text-gray-300 font-bold">LAYERS ({documentData.layers.length})</span><div className="mt-2 space-y-1">{[...documentData.layers].reverse().map((layer) => <div key={layer.id} onClick={() => setSelectedLayerId(layer.id)} className={`flex items-center justify-between rounded border px-2 py-2 cursor-pointer ${selectedLayerId === layer.id ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300' : 'border-gray-800 bg-[#111726] text-gray-400'}`}><span className="truncate">{layer.name}</span><div className="flex items-center gap-1"><button onClick={(event) => { event.stopPropagation(); setDocumentData((previous) => ({ ...previous, layers: previous.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, visible: !candidate.visible } : candidate) })); }}>{layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button><button onClick={(event) => { event.stopPropagation(); setDocumentData((previous) => ({ ...previous, layers: previous.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, locked: !candidate.locked } : candidate) })); }}>{layer.locked ? <Lock size={11} /> : <Unlock size={11} />}</button></div></div>)}</div></div>
        {selectedLayer && <div className="space-y-3 border-t border-gray-800 pt-3"><div className="flex items-center justify-between"><span className="font-bold text-cyan-300">SELECTED LAYER</span><button disabled={selectedLayer.locked} onClick={deleteSelected} className="text-red-400 disabled:opacity-30"><Trash2 size={13} /></button></div><input value={selectedLayer.name} onChange={(event) => updateSelectedLayer({ name: event.target.value })} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white" />{selectedLayer.type === 'text' && <><textarea value={selectedLayer.text || ''} onChange={(event) => updateSelectedLayer({ text: event.target.value })} className="w-full rounded border border-gray-700 bg-[#141b2b] p-2 text-white" /><input type="number" value={selectedLayer.fontSize || 16} onChange={(event) => updateSelectedLayer({ fontSize: parseInt(event.target.value) || 16 })} className="w-full rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white" /></>}<div><span className="text-[10px] text-gray-500">OPACITY {Math.round(selectedLayer.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={selectedLayer.opacity} onChange={(event) => updateSelectedLayer({ opacity: parseFloat(event.target.value) })} className="w-full accent-cyan-400" /></div><div className="grid grid-cols-2 gap-2"><input type="number" value={selectedLayer.x} onChange={(event) => updateSelectedLayer({ x: parseInt(event.target.value) || 0 })} className="rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white" /><input type="number" value={selectedLayer.y} onChange={(event) => updateSelectedLayer({ y: parseInt(event.target.value) || 0 })} className="rounded border border-gray-700 bg-[#141b2b] px-2 py-1 text-white" /></div></div>}
      </div>
    </div>
  );
};
