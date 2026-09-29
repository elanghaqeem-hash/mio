import type { AssetGraphEdge } from './AssetRelationshipGraph';
export function exactDuplicateEdge(id:string,from:string,to:string,sha256:string):AssetGraphEdge{
 const hash=sha256.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('Exact duplicate edge requires SHA-256 evidence');
 return {id,from,to,kind:'EXACT_DUPLICATE',directed:false,confidence:1,source:'HASH',evidenceIds:[`sha256:${hash}`]};
}
