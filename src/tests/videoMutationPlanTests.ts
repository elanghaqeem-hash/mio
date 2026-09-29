import { validateVideoMutationPlan } from '../file-intelligence/VideoMutationPlan';
interface SuiteResult{passed:number;total:number}
export async function runVideoMutationPlanTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`VideoMutationPlan test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const clip=validateVideoMutationPlan({kind:'EXTRACT_CLIP',sourceAssetId:'v1',outputName:'clip.mp4',clip:{startSeconds:5,endSeconds:10},requiresApproval:true,execute:false,analyzerVersion:'mio-video-mutation-plan-v1'},30);
 check(clip.execute===false&&clip.requiresApproval,'Clip planning is non-executing and approval-gated');
 const transcode=validateVideoMutationPlan({kind:'TRANSCODE',sourceAssetId:'v1',outputName:'out.webm',transcode:{container:'WEBM',videoCodec:'VP9',audioCodec:'OPUS'},requiresApproval:true,execute:false,analyzerVersion:'mio-video-mutation-plan-v1'},30);
 check(transcode.transcode?.container==='WEBM','Transcode target validates');
 let range=false;try{validateVideoMutationPlan({...clip,clip:{startSeconds:20,endSeconds:31}},30);}catch{range=true;}check(range,'Out-of-range clip is rejected');
 return {passed,total};
}
