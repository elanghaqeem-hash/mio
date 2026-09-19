import type { DrawingBrushSettings } from './DrawingBrushEngine';
export interface DrawingBrushPreset { id:string; name:string; settings:DrawingBrushSettings; }
const presets:DrawingBrushPreset[]=[
 {id:'mio-pencil',name:'Mio Pencil',settings:{size:4,opacity:.9,spacing:.08,smoothing:.35,pressureSize:.75,pressureOpacity:.35}},
 {id:'mio-ink',name:'Mio Ink',settings:{size:8,opacity:1,spacing:.06,smoothing:.2,pressureSize:.9,pressureOpacity:.1}},
 {id:'mio-round',name:'Mio Round',settings:{size:24,opacity:1,spacing:.15,smoothing:.1,pressureSize:1,pressureOpacity:0}},
 {id:'mio-eraser',name:'Mio Eraser',settings:{size:32,opacity:1,spacing:.12,smoothing:.15,pressureSize:.7,pressureOpacity:0}},
];
export const listDrawingBrushPresets=()=>presets.map(p=>structuredClone(p));
export const getDrawingBrushPreset=(id:string)=>{const p=presets.find(item=>item.id===id);return p?structuredClone(p):null;};
