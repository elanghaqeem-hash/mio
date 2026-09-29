export type Creative3DPreviewSource='LOCAL_RENDERER'|'EXTERNAL_RENDERER'|'EMBEDDED_PREVIEW'|'IMPORTED_PREVIEW';
export interface Creative3DPreviewEvidence{width:number;height:number;source:Creative3DPreviewSource;rendererId:string;externalProcessing:boolean;view?:'FRONT'|'BACK'|'LEFT'|'RIGHT'|'TOP'|'BOTTOM'|'PERSPECTIVE'|'DOCUMENT';analyzerVersion:'mio-creative-3d-preview-v1';}
export function validateCreative3DPreview(p:Creative3DPreviewEvidence):Creative3DPreviewEvidence{
 if(!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width<=0||p.height<=0||p.width*p.height>33_554_432)throw new Error('Preview dimensions are invalid or exceed bounded pixel budget');
 if(!p.rendererId.trim())throw new Error('Preview renderer/source identity is required');
 if(p.externalProcessing!==(p.source==='EXTERNAL_RENDERER'))throw new Error('Preview external-processing flag conflicts with source');
 return p;
}
