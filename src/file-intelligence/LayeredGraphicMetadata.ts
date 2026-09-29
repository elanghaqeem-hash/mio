export interface CreativeLayer{index:number;name?:string;visible?:boolean;opacity?:number;blendMode?:string;bounds?:{x:number;y:number;width:number;height:number};}
export interface LayeredGraphicMetadata{width:number;height:number;layerCount:number;layers:CreativeLayer[];source:'STRUCTURE_PARSER'|'IMPORTED_METADATA';parserId:string;analyzerVersion:'mio-layered-graphic-v1';}
export function validateLayeredGraphicMetadata(m:LayeredGraphicMetadata):LayeredGraphicMetadata{
 if(!Number.isSafeInteger(m.width)||!Number.isSafeInteger(m.height)||m.width<=0||m.height<=0||!m.parserId.trim())throw new Error('Invalid layered graphic metadata');
 if(!Number.isSafeInteger(m.layerCount)||m.layerCount<0||m.layerCount!==m.layers.length)throw new Error('Layer count conflicts with layer evidence');
 const ids=new Set<number>();
 for(const l of m.layers){if(!Number.isSafeInteger(l.index)||l.index<0||ids.has(l.index))throw new Error('Layer indexes must be unique');ids.add(l.index);if(l.opacity!==undefined&&(!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1))throw new Error('Layer opacity must be between 0 and 1');if(l.bounds&&(l.bounds.width<0||l.bounds.height<0))throw new Error('Layer bounds cannot be negative');}
 return m;
}
