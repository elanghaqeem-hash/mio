import type { SemanticModality } from './SemanticProfile';
export type EmbeddingSource='LOCAL_MODEL'|'EXTERNAL_MODEL'|'IMPORTED';
export interface SemanticEmbedding{assetId:string;modality:SemanticModality;dimensions:number;values:number[];modelId:string;source:EmbeddingSource;externalProcessing:boolean;normalized:boolean;analyzerVersion:'mio-semantic-embedding-v1';}
export function validateSemanticEmbedding(e:SemanticEmbedding):SemanticEmbedding{
 if(!e.assetId.trim()||!e.modelId.trim()||!Number.isSafeInteger(e.dimensions)||e.dimensions<1||e.dimensions>16384||e.values.length!==e.dimensions)throw new Error('Invalid semantic embedding identity or dimensions');
 if(e.externalProcessing!==(e.source==='EXTERNAL_MODEL'))throw new Error('Embedding external-processing provenance conflicts with source');
 if(e.values.some(v=>!Number.isFinite(v)))throw new Error('Embedding contains non-finite values');
 const norm=Math.sqrt(e.values.reduce((s,v)=>s+v*v,0));if(norm===0)throw new Error('Zero-vector embedding is not comparable');
 if(e.normalized&&Math.abs(norm-1)>1e-4)throw new Error('Embedding marked normalized but norm differs from 1');
 return e;
}
