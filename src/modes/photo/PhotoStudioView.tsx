import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Image, Lock, RotateCcw, Upload, Unlock } from 'lucide-react';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { ExportManager } from '../../project/ExportManager';
import type { MioPhotoDocument, PhotoAdjustments } from '../../types/creative';

const neutral: PhotoAdjustments = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, grayscale: 0, sepia: 0, blur: 0, vignette: 0 };
const INITIAL_PHOTO: MioPhotoDocument = { width: 960, height: 640, backgroundColor: '#111827', layers: [{ id: 'photo_base', name: 'Base Image', visible: true, locked: false, opacity: 1, adjustments: neutral }] };
const presets: Record<string, Partial<PhotoAdjustments>> = {
  Natural: neutral, Vivid: { contrast: 12, saturation: 24 }, Mono: { grayscale: 100, contrast: 10 }, Warm: { temperature: 24, saturation: 8 }, Film: { contrast: 16, saturation: -8, sepia: 18, vignette: 22 },
};

const loadImage = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => { const image = new window.Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });

const renderPhoto = async (canvas: HTMLCanvasElement, photo: MioPhotoDocument, original = false): Promise<void> => {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = photo.backgroundColor; context.fillRect(0, 0, canvas.width, canvas.height);
  const visible = photo.layers.filter((layer) => layer.visible && layer.sourceDataUrl);
  if (!visible.length) {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height); gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(0.5, '#164e63'); gradient.addColorStop(1, '#7c2d12'); context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#e2e8f0'; context.font = '28px sans-serif'; context.textAlign = 'center'; context.fillText('Import a local image to begin', canvas.width / 2, canvas.height / 2);
    return;
  }
  for (const layer of visible) {
    const image = await loadImage(layer.sourceDataUrl!);
    const a = original ? neutral : layer.adjustments;
    context.save(); context.globalAlpha = layer.opacity;
    context.filter = `brightness(${100 + a.exposure * 35}%) contrast(${100 + a.contrast}%) saturate(${100 + a.saturation}%) grayscale(${a.grayscale}%) sepia(${a.sepia}%) blur(${a.blur}px)`;
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height); const width = image.width * scale; const height = image.height * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); context.filter = 'none';
    if (!original && a.temperature) { context.globalCompositeOperation = 'soft-light'; context.fillStyle = a.temperature > 0 ? `rgba(255,120,20,${Math.abs(a.temperature) / 140})` : `rgba(20,120,255,${Math.abs(a.temperature) / 140})`; context.fillRect(0, 0, canvas.width, canvas.height); }
    if (!original && a.tint) { context.globalCompositeOperation = 'soft-light'; context.fillStyle = a.tint > 0 ? `rgba(255,20,180,${Math.abs(a.tint) / 180})` : `rgba(20,255,120,${Math.abs(a.tint) / 180})`; context.fillRect(0, 0, canvas.width, canvas.height); }
    if (!original && a.vignette) { const gradient = context.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width * .2, canvas.width / 2, canvas.height / 2, canvas.width * .7); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, `rgba(0,0,0,${a.vignette / 100})`); context.globalCompositeOperation = 'source-over'; context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.restore();
  }
};

export const PhotoStudioView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const workspace = useCreativeStudioDocument<MioPhotoDocument>('MIO_Photo.miophoto', INITIAL_PHOTO);
  const { state: photo, setState: setPhoto } = workspace;
  const [selectedId, setSelectedId] = useState('photo_base');
  const [before, setBefore] = useState(false);
  const selected = photo.layers.find((layer) => layer.id === selectedId);
  useEffect(() => { if (canvasRef.current) void renderPhoto(canvasRef.current, photo, before); }, [photo, before]);

  const update = (changes: Partial<PhotoAdjustments>) => { if (selected && !selected.locked) setPhoto((previous) => ({ ...previous, layers: previous.layers.map((layer) => layer.id === selected.id ? { ...layer, adjustments: { ...layer.adjustments, ...changes } } : layer) })); };
  const importImage = (file?: File) => { if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => { const id = `photo_${Date.now().toString(36)}`; setPhoto((previous) => ({ ...previous, layers: [...previous.layers.filter((layer) => layer.sourceDataUrl), { id, name: file.name, visible: true, locked: false, opacity: 1, sourceDataUrl: String(reader.result), adjustments: { ...neutral } }] })); setSelectedId(id); }; reader.readAsDataURL(file); };
  const controls: Array<[keyof PhotoAdjustments, number, number, number]> = [['exposure', -2, 2, .1], ['contrast', -100, 100, 1], ['saturation', -100, 100, 1], ['temperature', -100, 100, 1], ['tint', -100, 100, 1], ['grayscale', 0, 100, 1], ['sepia', 0, 100, 1], ['blur', 0, 12, .2], ['vignette', 0, 100, 1]];

  return <div className="relative flex h-full overflow-hidden bg-[#07090e] font-mono text-xs"><CreativeWorkspaceToolbar workspace={workspace} /><main className="flex min-w-0 flex-1 flex-col p-4"><header className="mb-3 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0d121d] p-3"><div className="flex items-center gap-2 font-bold text-cyan-300"><Image size={15} />PHOTO EDITING // NONDESTRUCTIVE DEVELOP</div><div className="flex gap-2"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => importImage(event.target.files?.[0])} /><button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-cyan-300"><Upload size={12} />Import</button><button onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)} className="rounded border border-gray-700 px-2 py-1 text-gray-300">Hold Before</button><button onClick={() => canvasRef.current && void ExportManager.exportCanvasAsPNG(canvasRef.current, 'MIO_Photo.png', 'PHOTO')} className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 font-bold text-black"><Download size={12} />PNG</button></div></header><div className="flex flex-1 items-center justify-center overflow-auto rounded-xl border border-gray-800 bg-[#090d16] p-4"><canvas ref={canvasRef} width={photo.width} height={photo.height} className="max-h-full max-w-full shadow-2xl" /></div></main><aside className="w-80 overflow-y-auto border-l border-gray-800 bg-[#0d121d] p-4"><div className="font-bold text-gray-300">PHOTO LAYERS</div><div className="mt-2 space-y-1">{[...photo.layers].reverse().map((layer) => <div key={layer.id} onClick={() => setSelectedId(layer.id)} className={`flex cursor-pointer items-center justify-between rounded border px-2 py-2 ${layer.id === selectedId ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300' : 'border-gray-800 text-gray-400'}`}><span className="truncate">{layer.name}</span><div className="flex gap-2"><button onClick={(event) => { event.stopPropagation(); setPhoto((p) => ({ ...p, layers: p.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) })); }}>{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button><button onClick={(event) => { event.stopPropagation(); setPhoto((p) => ({ ...p, layers: p.layers.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item) })); }}>{layer.locked ? <Lock size={12} /> : <Unlock size={12} />}</button></div></div>)}</div>{selected && <><div className="mt-4 grid grid-cols-3 gap-1">{Object.entries(presets).map(([name, values]) => <button key={name} disabled={selected.locked} onClick={() => update({ ...neutral, ...values })} className="rounded border border-gray-700 px-1 py-1 text-[10px] text-gray-300 disabled:opacity-40">{name}</button>)}</div><div className="mt-4 flex items-center justify-between"><span className="font-bold text-cyan-300">ADJUSTMENTS</span><button disabled={selected.locked} onClick={() => update(neutral)}><RotateCcw size={13} /></button></div><div className="mt-2 space-y-3">{controls.map(([field, min, max, step]) => <label key={field} className="block uppercase text-gray-500"><span className="flex justify-between"><span>{field}</span><span>{selected.adjustments[field]}</span></span><input type="range" min={min} max={max} step={step} value={selected.adjustments[field]} disabled={selected.locked} onChange={(event) => update({ [field]: Number(event.target.value) })} className="w-full accent-cyan-400 disabled:opacity-40" /></label>)}</div></>}</aside></div>;
};
