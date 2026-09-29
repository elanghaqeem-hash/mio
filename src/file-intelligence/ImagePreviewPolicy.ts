export interface ImagePreviewRequest {
  maxWidth: number;
  maxHeight: number;
  allowUpscale?: boolean;
}

export interface ImagePreviewPlan {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  scale: number;
  requiresResize: boolean;
  localOnly: true;
}

const MAX_PREVIEW_EDGE = 2048;
const MAX_SOURCE_PIXELS = 120_000_000;

export function planImagePreview(sourceWidth: number, sourceHeight: number, request: ImagePreviewRequest): ImagePreviewPlan {
  for (const [label, value] of [['sourceWidth', sourceWidth], ['sourceHeight', sourceHeight], ['maxWidth', request.maxWidth], ['maxHeight', request.maxHeight]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  }
  if (sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) throw new Error('Image exceeds safe preview pixel budget');
  if (request.maxWidth > MAX_PREVIEW_EDGE || request.maxHeight > MAX_PREVIEW_EDGE) throw new Error(`Preview edge exceeds ${MAX_PREVIEW_EDGE}px ceiling`);

  const rawScale = Math.min(request.maxWidth / sourceWidth, request.maxHeight / sourceHeight);
  const scale = request.allowUpscale ? rawScale : Math.min(1, rawScale);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  return {
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    scale,
    requiresResize: targetWidth !== sourceWidth || targetHeight !== sourceHeight,
    localOnly: true,
  };
}
