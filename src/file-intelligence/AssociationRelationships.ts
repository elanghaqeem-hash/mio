import type { AssetGraphEdge } from './AssetRelationshipGraph';
export function associationEdge(id:string,from:string,to:string,kind:'SAME_PROJECT'|'SAME_CLIENT',associationId:string,confidence:number,userConfirmed=false):AssetGraphEdge{
 if(!associationId.trim()||!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error('Association edge requires identity and bounded confidence');
 return {id,from,to,kind,directed:false,confidence:userConfirmed?1:confidence,source:userConfirmed?'USER_CONFIRMED':'METADATA',evidenceIds:[`${kind.toLowerCase()}:${associationId}`]};
}
export function temporalProximityEdge(id:string,from:string,to:string,leftEpochMs:number,rightEpochMs:number,maxDistanceMs:number):AssetGraphEdge{
 if(!Number.isFinite(leftEpochMs)||!Number.isFinite(rightEpochMs)||!Number.isFinite(maxDistanceMs)||maxDistanceMs<=0)throw new Error('Temporal proximity requires finite timestamps and positive window');
 const distance=Math.abs(leftEpochMs-rightEpochMs);if(distance>maxDistanceMs)throw new Error('Assets exceed temporal proximity window');
 return {id,from,to,kind:'TEMPORAL_PROXIMITY',directed:false,confidence:Math.max(0,1-distance/maxDistanceMs),source:'METADATA',evidenceIds:[`distance-ms:${distance}`,`window-ms:${maxDistanceMs}`]};
}
