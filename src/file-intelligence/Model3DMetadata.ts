export interface Model3DMetadata{
 geometry:{meshCount:number;vertexCount?:number;triangleCount?:number};
 materials:{count:number;names?:string[]};textures:{count:number;uris?:string[]};
 animations:{count:number;names?:string[];durationSeconds?:number};
 source:'STRUCTURE_PARSER'|'IMPORTED_METADATA';parserId:string;analyzerVersion:'mio-model-3d-metadata-v1';
}
const nonneg=(n:number|undefined)=>n===undefined&&(true)||Number.isSafeInteger(n)&&n>=0;
export function validateModel3DMetadata(m:Model3DMetadata):Model3DMetadata{
 if(!m.parserId.trim())throw new Error('3D metadata parser provenance is required');
 if(!nonneg(m.geometry.meshCount)||!nonneg(m.geometry.vertexCount)||!nonneg(m.geometry.triangleCount)||!nonneg(m.materials.count)||!nonneg(m.textures.count)||!nonneg(m.animations.count))throw new Error('3D metadata counts must be non-negative integers');
 if(m.materials.names&&m.materials.names.length>m.materials.count)throw new Error('Material names exceed declared count');
 if(m.textures.uris&&m.textures.uris.length>m.textures.count)throw new Error('Texture references exceed declared count');
 if(m.animations.names&&m.animations.names.length>m.animations.count)throw new Error('Animation names exceed declared count');
 if(m.animations.durationSeconds!==undefined&&(!Number.isFinite(m.animations.durationSeconds)||m.animations.durationSeconds<0))throw new Error('Animation duration must be non-negative');
 return m;
}
