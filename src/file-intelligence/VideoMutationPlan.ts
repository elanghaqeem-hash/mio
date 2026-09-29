export type VideoMutationKind='TRANSCODE'|'EXTRACT_CLIP';
export interface VideoMutationPlan{
 kind:VideoMutationKind;sourceAssetId:string;outputName:string;
 clip?:{startSeconds:number;endSeconds:number};
 transcode?:{container:'MP4'|'WEBM';videoCodec:'H264'|'VP9'|'COPY';audioCodec:'AAC'|'OPUS'|'COPY'};
 requiresApproval:true;execute:false;analyzerVersion:'mio-video-mutation-plan-v1';
}
export function validateVideoMutationPlan(plan:VideoMutationPlan,durationSeconds:number):VideoMutationPlan{
 if(!plan.sourceAssetId.trim()||!plan.outputName.trim())throw new Error('Video mutation source/output are required');
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error('Known positive source duration is required');
 if(plan.requiresApproval!==true||plan.execute!==false)throw new Error('Video mutation planning cannot execute implicitly');
 if(plan.kind==='EXTRACT_CLIP'){
  if(!plan.clip)throw new Error('Clip plan requires time range');
  const {startSeconds,endSeconds}=plan.clip;
  if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds)||startSeconds<0||endSeconds<=startSeconds||endSeconds>durationSeconds)throw new Error('Clip range is outside source duration');
 }
 if(plan.kind==='TRANSCODE'&&!plan.transcode)throw new Error('Transcode plan requires target codecs/container');
 return plan;
}
