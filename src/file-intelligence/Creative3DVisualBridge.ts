import type { Creative3DPreviewEvidence } from './Creative3DPreview';
export interface Creative3DVisualBridge{preview:Creative3DPreviewEvidence;imageIntelligenceReady:true;provenance:{source:'PREVIEW_RENDER';rendererId:string;externalProcessing:boolean};analyzerVersion:'mio-creative-3d-visual-bridge-v1';}
export function bridgeCreative3DPreviewToImage(preview:Creative3DPreviewEvidence):Creative3DVisualBridge{
 return {preview,imageIntelligenceReady:true,provenance:{source:'PREVIEW_RENDER',rendererId:preview.rendererId,externalProcessing:preview.externalProcessing},analyzerVersion:'mio-creative-3d-visual-bridge-v1'};
}
