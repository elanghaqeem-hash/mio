import type { OcrResult } from './OcrTextIntelligence';
import { validateOcrResult } from './OcrTextIntelligence';
import type { DocumentPageLayout, DocumentRegion } from './DocumentLayout';
import { sortRegionsReadingOrder, validateDocumentLayout } from './DocumentLayout';

export interface ScannedPageIntelligence {
  pageIndex: number;
  layout: DocumentPageLayout;
  text: string;
  language?: string;
  ocrEngineId: string;
  externalProcessing: boolean;
  analyzerVersion: 'mio-scanned-page-v1';
}

export function mapOcrToDocumentPage(
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  ocr: OcrResult,
): ScannedPageIntelligence {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) throw new Error('Invalid scanned-page index');
  validateOcrResult(ocr);
  const regions: DocumentRegion[] = ocr.regions.map((region, index) => ({
    id: `ocr-${pageIndex}-${index}`,
    pageIndex,
    kind: 'PARAGRAPH',
    box: { x: region.x, y: region.y, width: region.width, height: region.height },
    text: region.text,
    confidence: region.confidence,
    source: 'OCR',
  }));
  const layout = validateDocumentLayout({
    pageIndex,
    width: pageWidth,
    height: pageHeight,
    regions: sortRegionsReadingOrder(regions),
    analyzerVersion: 'mio-document-layout-v1',
  });
  return {
    pageIndex,
    layout,
    text: ocr.text,
    language: ocr.language,
    ocrEngineId: ocr.engineId,
    externalProcessing: ocr.externalProcessing,
    analyzerVersion: 'mio-scanned-page-v1',
  };
}
