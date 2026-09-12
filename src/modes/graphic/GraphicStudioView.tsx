import React, { useState, useRef, useEffect } from 'react';
import { MioGraphicDocument, GraphicLayer } from '../../types/creative';
import { ExportManager } from '../../project/ExportManager';
import { Square, Circle, Type, Download, Plus, Trash2, Eye, EyeOff, Lock, Unlock, ShieldCheck, Palette } from 'lucide-react';
import { eventBus } from '../../core/EventBus';

export const GraphicStudioView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [documentData, setDocumentData] = useState<MioGraphicDocument>({
    width: 600,
    height: 700,
    backgroundColor: '#07090e',
    layers: [
      {
        id: 'layer_bg_frame',
        name: 'Technical Grid Frame',
        type: 'shape',
        shapeType: 'rectangle',
        visible: true,
        locked: true,
        opacity: 1,
        x: 20,
        y: 20,
        width: 560,
        height: 660,
        stroke: '#00f0ff',
        strokeWidth: 2,
        fill: '#0a0f1d',
      },
      {
        id: 'layer_accent_box',
        name: 'Core Sensor Accent',
        type: 'shape',
        shapeType: 'circle',
        visible: true,
        locked: false,
        opacity: 0.8,
        x: 300,
        y: 260,
        width: 140,
        height: 140,
        fill: '#00f0ff22',
        stroke: '#00f0ff',
        strokeWidth: 3,
      },
      {
        id: 'layer_title',
        name: 'Title Typography',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 1,
        x: 50,
        y: 80,
        width: 500,
        height: 40,
        text: 'MIO V2 // VANGUARD SYSTEM',
        fontSize: 24,
        fontFamily: 'monospace',
        fill: '#00f0ff',
      },
      {
        id: 'layer_subtitle',
        name: 'Sub-header Spec',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 0.85,
        x: 50,
        y: 120,
        width: 500,
        height: 30,
        text: 'AUTONOMOUS MULTIMODAL CREATIVE SUITE',
        fontSize: 14,
        fontFamily: 'monospace',
        fill: '#94a3b8',
      },
    ],
  });

  const [selectedLayerId, setSelectedLayerId] = useState<string>('layer_title');
  const selectedLayer = documentData.layers.find((l) => l.id === selectedLayerId);

  // Redraw Canvas whenever document changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = documentData.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid Blueprint lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Render Layers
    documentData.layers.forEach((layer) => {
      if (!layer.visible) return;

      ctx.save();
      ctx.globalAlpha = layer.opacity;

      if (layer.type === 'shape') {
        if (layer.shapeType === 'rectangle') {
          if (layer.fill) {
            ctx.fillStyle = layer.fill;
            ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
          }
          if (layer.stroke) {
            ctx.strokeStyle = layer.stroke;
            ctx.lineWidth = layer.strokeWidth || 1;
            ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
          }
        } else if (layer.shapeType === 'circle') {
          ctx.beginPath();
          ctx.arc(layer.x, layer.y, layer.width / 2, 0, Math.PI * 2);
          if (layer.fill) {
            ctx.fillStyle = layer.fill;
            ctx.fill();
          }
          if (layer.stroke) {
            ctx.strokeStyle = layer.stroke;
            ctx.lineWidth = layer.strokeWidth || 1;
            ctx.stroke();
          }
        }
      } else if (layer.type === 'text') {
        ctx.fillStyle = layer.fill || '#ffffff';
        ctx.font = `bold ${layer.fontSize || 16}px ${layer.fontFamily || 'monospace'}`;
        ctx.fillText(layer.text || '', layer.x, layer.y);
      }

      // Selection bounding box
      if (layer.id === selectedLayerId) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        if (layer.shapeType === 'circle') {
          ctx.strokeRect(layer.x - layer.width / 2 - 4, layer.y - layer.height / 2 - 4, layer.width + 8, layer.height + 8);
        } else {
          ctx.strokeRect(layer.x - 4, layer.y - 4, layer.width + 8, (layer.height || layer.fontSize || 20) + 8);
        }
        ctx.setLineDash([]);
      }

      ctx.restore();
    });
  }, [documentData, selectedLayerId]);

  const updateSelectedLayer = (updates: Partial<GraphicLayer>) => {
    if (!selectedLayerId) return;
    setDocumentData((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l)),
    }));
  };

  const addLayer = (type: 'shape' | 'text', shapeType: 'rectangle' | 'circle' = 'rectangle') => {
    const newLayer: GraphicLayer = {
      id: `layer_${Date.now()}`,
      name: type === 'text' ? 'New Text Layer' : `New ${shapeType}`,
      type,
      shapeType: type === 'shape' ? shapeType : undefined,
      visible: true,
      locked: false,
      opacity: 1,
      x: 100,
      y: 200,
      width: 150,
      height: 100,
      fill: type === 'text' ? '#00f0ff' : '#0e1726',
      stroke: '#00f0ff',
      strokeWidth: 2,
      text: type === 'text' ? 'MIO VECTOR TEXT' : undefined,
      fontSize: 18,
      fontFamily: 'monospace',
    };

    setDocumentData((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
    setSelectedLayerId(newLayer.id);
    eventBus.emit('ACTIVITY_LOG', {
      timestamp: Date.now(),
      message: `Created graphic layer: ${newLayer.name}`,
      mode: 'GRAPHIC',
    });
  };

  const deleteLayer = (id: string) => {
    setDocumentData((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== id),
    }));
    if (selectedLayerId === id) {
      setSelectedLayerId(documentData.layers[0]?.id || '');
    }
  };

  return (
    <div className="flex h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      {/* Canvas Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#0a0e17] overflow-auto">
        <div className="flex items-center justify-between w-full max-w-[600px] mb-2 px-2">
          <div className="flex items-center gap-2 text-cyan-300">
            <Palette size={14} />
            <span className="font-bold">GRAPHIC DESIGN CANVAS // 2D VECTOR</span>
            <span className="flex items-center gap-1 text-emerald-400 text-[10px] ml-2">
              <ShieldCheck size={12} /> VERIFIED
            </span>
          </div>

          <button
            onClick={() => {
              if (canvasRef.current) {
                ExportManager.exportCanvasAsPNG(canvasRef.current, 'Mio_Graphic_Poster.png');
              }
            }}
            className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/20"
          >
            <Download size={13} /> Export PNG
          </button>
        </div>

        <div className="border border-cyan-500/30 rounded-lg overflow-hidden shadow-2xl shadow-cyan-950/40 bg-black">
          <canvas
            ref={canvasRef}
            width={documentData.width}
            height={documentData.height}
            className="block cursor-crosshair"
          />
        </div>
      </div>

      {/* Right Layers and Properties Panel */}
      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 flex flex-col">
        {/* Layer Controls */}
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300 font-bold">CANVAS LAYERS ({documentData.layers.length})</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => addLayer('shape', 'rectangle')}
                className="p-1 hover:bg-gray-800 text-cyan-400 rounded cursor-pointer"
                title="Add Rectangle"
              >
                <Square size={13} />
              </button>
              <button
                onClick={() => addLayer('shape', 'circle')}
                className="p-1 hover:bg-gray-800 text-cyan-400 rounded cursor-pointer"
                title="Add Circle"
              >
                <Circle size={13} />
              </button>
              <button
                onClick={() => addLayer('text')}
                className="p-1 hover:bg-gray-800 text-cyan-400 rounded cursor-pointer"
                title="Add Text"
              >
                <Type size={13} />
              </button>
            </div>
          </div>

          {/* Layer List */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {documentData.layers.map((layer) => (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition ${
                  selectedLayerId === layer.id
                    ? 'bg-cyan-950/60 border border-cyan-500/50 text-cyan-300'
                    : 'hover:bg-gray-800/60 text-gray-400'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {layer.type === 'text' ? <Type size={12} /> : <Square size={12} />}
                  <span className="truncate">{layer.name}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSelectedLayer({ visible: !layer.visible });
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSelectedLayer({ locked: !layer.locked });
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  {documentData.layers.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLayer(layer.id);
                      }}
                      className="p-1 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Layer Properties */}
        {selectedLayer ? (
          <div className="flex-1 p-3 overflow-y-auto space-y-4">
            <div>
              <span className="text-gray-400 block text-[10px] mb-1">LAYER NAME</span>
              <input
                type="text"
                value={selectedLayer.name}
                onChange={(e) => updateSelectedLayer({ name: e.target.value })}
                className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-400"
              />
            </div>

            {selectedLayer.type === 'text' && (
              <div>
                <span className="text-gray-400 block text-[10px] mb-1">TEXT CONTENT</span>
                <textarea
                  rows={2}
                  value={selectedLayer.text || ''}
                  onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                  className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {/* Coordinates and Dimensions */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-400 block text-[10px] mb-1">X POSITION</span>
                <input
                  type="number"
                  value={selectedLayer.x}
                  onChange={(e) => updateSelectedLayer({ x: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white"
                />
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] mb-1">Y POSITION</span>
                <input
                  type="number"
                  value={selectedLayer.y}
                  onChange={(e) => updateSelectedLayer({ y: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#141b2b] border border-gray-700 rounded px-2 py-1 text-white"
                />
              </div>
            </div>

            {/* Styling */}
            <div className="space-y-2 border-t border-gray-800 pt-3">
              <span className="text-cyan-400 font-bold block text-[11px]">COLOR &amp; APPEARANCE</span>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Fill Color:</span>
                <input
                  type="color"
                  value={selectedLayer.fill || '#00f0ff'}
                  onChange={(e) => updateSelectedLayer({ fill: e.target.value })}
                  className="w-7 h-6 rounded cursor-pointer bg-transparent border-0"
                />
              </div>

              {selectedLayer.stroke !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Stroke Color:</span>
                  <input
                    type="color"
                    value={selectedLayer.stroke || '#00f0ff'}
                    onChange={(e) => updateSelectedLayer({ stroke: e.target.value })}
                    className="w-7 h-6 rounded cursor-pointer bg-transparent border-0"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between text-gray-400 text-[10px] mb-1">
                  <span>Opacity:</span>
                  <span>{Math.round(selectedLayer.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={selectedLayer.opacity}
                  onChange={(e) => updateSelectedLayer({ opacity: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500">No layer selected</div>
        )}
      </div>
    </div>
  );
};
