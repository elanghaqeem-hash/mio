export type DocumentRegionKind =
  | 'HEADING' | 'PARAGRAPH' | 'TABLE' | 'IMAGE' | 'CHART'
  | 'FORM' | 'HEADER' | 'FOOTER' | 'LIST' | 'CAPTION' | 'UNKNOWN';

export interface NormalizedBox { x: number; y: number; width: number; height: number; }
export interface DocumentRegion {
  id: string;
  pageIndex: number;
  kind: DocumentRegionKind;
  box: NormalizedBox;
  text?: string;
  confidence?: number;
  source: 'NATIVE' | 'OCR' | 'VISION' | 'HEURISTIC';
}
export interface DocumentPageLayout {
  pageIndex: number;
  width: number;
  height: number;
  regions: DocumentRegion[];
  analyzerVersion: 'mio-document-layout-v1';
}

const finitePositive = (n: number) => Number.isFinite(n) && n > 0;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function normalizeDocumentBox(
  pageWidth: number, pageHeight: number,
  box: { x: number; y: number; width: number; height: number },
): NormalizedBox {
  if (!finitePositive(pageWidth) || !finitePositive(pageHeight)) throw new Error('Page dimensions must be finite and positive');
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width < 0 || box.height < 0) throw new Error('Invalid document region box');
  const x1 = clamp01(box.x / pageWidth), y1 = clamp01(box.y / pageHeight);
  const x2 = clamp01((box.x + box.width) / pageWidth), y2 = clamp01((box.y + box.height) / pageHeight);
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
}

export function validateDocumentLayout(layout: DocumentPageLayout): DocumentPageLayout {
  if (!Number.isSafeInteger(layout.pageIndex) || layout.pageIndex < 0) throw new Error('Invalid page index');
  if (!finitePositive(layout.width) || !finitePositive(layout.height)) throw new Error('Invalid page dimensions');
  const ids = new Set<string>();
  for (const region of layout.regions) {
    if (!region.id || ids.has(region.id)) throw new Error('Document region IDs must be non-empty and unique');
    ids.add(region.id);
    if (region.pageIndex !== layout.pageIndex) throw new Error('Region page index mismatch');
    const { x, y, width, height } = region.box;
    if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 0 || width < 0 || height < 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error('Region box must be normalized to page bounds');
    if (region.confidence !== undefined && (!Number.isFinite(region.confidence) || region.confidence < 0 || region.confidence > 1)) throw new Error('Region confidence must be between 0 and 1');
  }
  return layout;
}

export function sortRegionsReadingOrder(regions: readonly DocumentRegion[]): DocumentRegion[] {
  return [...regions].sort((a,b) => a.pageIndex-b.pageIndex || a.box.y-b.box.y || a.box.x-b.box.x || a.id.localeCompare(b.id));
}
