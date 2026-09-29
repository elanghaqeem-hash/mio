import { validateSemanticEmbedding,type SemanticEmbedding } from './SemanticEmbedding';
export interface CrossModalSimilarity{leftAssetId:string;rightAssetId:string;score:number;modelId:string;comparable:true;algorithm:'cosine-v1';}
export function compareSemanticEmbeddings(a:SemanticEmbedding,b:SemanticEmbedding):CrossModalSimilarity{
 validateSemanticEmbedding(a);validateSemanticEmbedding(b);
 if(a.modelId!==b.modelId||a.dimensions!==b.dimensions)throw new Error('Cross-modal embeddings require the same model space and dimensions');
 let dot=0,na=0,nb=0;for(let i=0;i<a.dimensions;i++){dot+=a.values[i]*b.values[i];na+=a.values[i]*a.values[i];nb+=b.values[i]*b.values[i];}
 const cosine=dot/(Math.sqrt(na)*Math.sqrt(nb));const score=Math.max(0,Math.min(1,(cosine+1)/2));
 return {leftAssetId:a.assetId,rightAssetId:b.assetId,score,modelId:a.modelId,comparable:true,algorithm:'cosine-v1'};
}
