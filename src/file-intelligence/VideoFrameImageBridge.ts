import type { VideoSamplePoint } from './VideoSampling';
export interface ExtractedVideoFrame {
 timestampSeconds:number;width:number;height:number;sampleReason:VideoSamplePoint['reason'];
 source:'LOCAL_DECODER'|'EXTERNAL_DECODER';decoderId:string;externalProcessing:boolean;
}
export interface VideoFrameImageEvidence {
 timestampSeconds:number;width:number;height:number;sampleReason:VideoSamplePoint['reason'];
 imageIntelligenceReady:true;decoderId:string;externalProcessing:boolean;
 analyzerVersion:'mio-video-frame-image-bridge-v1';
}
export function bridgeVideoFrameToImageIntelligence(frame:ExtractedVideoFrame):VideoFrameImageEvidence{
 if(!Number.isFinite(frame.timestampSeconds)||frame.timestampSeconds<0)throw new Error('Invalid video frame timestamp');
 if(!Number.isSafeInteger(frame.width)||!Number.isSafeInteger(frame.height)||frame.width<=0||frame.height<=0)throw new Error('Invalid video frame dimensions');
 if(!frame.decoderId.trim())throw new Error('Video decoder provenance is required');
 if(frame.externalProcessing!==(frame.source==='EXTERNAL_DECODER'))throw new Error('Video frame external-processing flag conflicts with decoder source');
 return {...frame,imageIntelligenceReady:true,analyzerVersion:'mio-video-frame-image-bridge-v1'};
}
