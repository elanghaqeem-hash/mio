import type { Creative3DAssetIdentity,Creative3DFormat,Creative3DAssetKind } from './Creative3DIdentity';
const ascii=(b:Uint8Array)=>new TextDecoder('ascii').decode(b);
const identity=(format:Creative3DFormat,kind:Creative3DAssetKind,extension:string):Creative3DAssetIdentity=>({format,kind,extension,source:'SIGNATURE',analyzerVersion:'mio-creative-3d-identity-v1'});
export function inspectCreative3DSignature(name:string,bytes:Uint8Array):Creative3DAssetIdentity|undefined{
 const ext=name.toLowerCase().split('.').pop()??'';
 if(bytes.length>=4&&ascii(bytes.slice(0,4))==='8BPS')return identity('PSD','LAYERED_GRAPHIC',ext);
 if(bytes.length>=4&&bytes[0]===0x67&&bytes[1]===0x6c&&bytes[2]===0x54&&bytes[3]===0x46)return identity('GLB','MODEL_3D',ext);
 if(bytes.length>=7&&ascii(bytes.slice(0,7))==='Kaydara')return identity('FBX','MODEL_3D',ext);
 if(bytes.length>=12&&ascii(bytes.slice(0,7))==='BLENDER')return identity('BLEND','MODEL_3D',ext);
 const head=new TextDecoder().decode(bytes.slice(0,Math.min(bytes.length,4096))).trimStart();
 if((head.startsWith('{')&&head.includes('"asset"')&&head.includes('"version"'))&&(ext==='gltf'||head.includes('"meshes"')))return identity('GLTF','MODEL_3D',ext);
 if(head.startsWith('<svg')||head.includes('<svg '))return identity('SVG','VECTOR_GRAPHIC',ext);
 if((ext==='obj'||head.startsWith('v ')||head.includes('\nv '))&&(head.includes('\nf ')||head.startsWith('o ')||head.includes('\no ')))return identity('OBJ','MODEL_3D',ext);
 return undefined;
}
