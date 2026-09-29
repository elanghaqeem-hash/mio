export type Creative3DFormat='PSD'|'SVG'|'AI'|'GLTF'|'GLB'|'OBJ'|'FBX'|'STL'|'BLEND'|'UNKNOWN';
export type Creative3DAssetKind='LAYERED_GRAPHIC'|'VECTOR_GRAPHIC'|'MODEL_3D'|'UNKNOWN';
export interface Creative3DAssetIdentity{format:Creative3DFormat;kind:Creative3DAssetKind;extension:string;mimeType?:string;source:'EXTENSION'|'SIGNATURE'|'STRUCTURE';analyzerVersion:'mio-creative-3d-identity-v1';}
const map:Record<string,[Creative3DFormat,Creative3DAssetKind]>={psd:['PSD','LAYERED_GRAPHIC'],svg:['SVG','VECTOR_GRAPHIC'],ai:['AI','VECTOR_GRAPHIC'],gltf:['GLTF','MODEL_3D'],glb:['GLB','MODEL_3D'],obj:['OBJ','MODEL_3D'],fbx:['FBX','MODEL_3D'],stl:['STL','MODEL_3D'],blend:['BLEND','MODEL_3D']};
export function identifyCreative3DByExtension(name:string):Creative3DAssetIdentity{
 const extension=name.toLowerCase().split('.').pop()??'';const hit=map[extension]??['UNKNOWN','UNKNOWN'];
 return {format:hit[0],kind:hit[1],extension,source:'EXTENSION',analyzerVersion:'mio-creative-3d-identity-v1'};
}
export function validateCreative3DIdentity(i:Creative3DAssetIdentity):Creative3DAssetIdentity{
 if(!i.extension.trim())throw new Error('Creative/3D identity requires extension evidence');
 if(i.format==='UNKNOWN'&&i.kind!=='UNKNOWN')throw new Error('Unknown creative format cannot claim a known asset kind');
 return i;
}
