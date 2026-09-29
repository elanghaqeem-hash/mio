import type { AssetGraphEdge } from './AssetRelationshipGraph';
export function contentRelationshipEdge(id:string,from:string,to:string,kind:'CONTENT_REFERENCE'|'DEPENDENCY',evidenceId:string,confidence=1):AssetGraphEdge{
 if(!id.trim()||!from.trim()||!to.trim()||from===to||!evidenceId.trim())throw new Error('Content/dependency relationship requires distinct assets and evidence');
 if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error('Relationship confidence must be bounded');
 return {id,from,to,kind,directed:true,confidence,source:'STRUCTURE',evidenceIds:[evidenceId]};
}
