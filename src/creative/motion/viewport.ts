export interface TimelineViewport {
  startFrame: number;
  pixelsPerFrame: number;
  widthPx: number;
}

export const frameToTimelineX = (frame: number, viewport: TimelineViewport): number =>
  (frame - viewport.startFrame) * viewport.pixelsPerFrame;

export const timelineXToFrame = (x: number, viewport: TimelineViewport): number =>
  Math.round(viewport.startFrame + x / viewport.pixelsPerFrame);

export function zoomTimelineViewport(viewport: TimelineViewport, factor: number, anchorX: number, minPixelsPerFrame = .1, maxPixelsPerFrame = 200): TimelineViewport {
  const anchorFrame = viewport.startFrame + anchorX / viewport.pixelsPerFrame;
  const pixelsPerFrame = Math.max(minPixelsPerFrame, Math.min(maxPixelsPerFrame, viewport.pixelsPerFrame * factor));
  return { ...viewport, pixelsPerFrame, startFrame: anchorFrame - anchorX / pixelsPerFrame };
}

export const panTimelineViewport = (viewport: TimelineViewport, deltaPx: number): TimelineViewport => ({
  ...viewport,
  startFrame: viewport.startFrame - deltaPx / viewport.pixelsPerFrame,
});
