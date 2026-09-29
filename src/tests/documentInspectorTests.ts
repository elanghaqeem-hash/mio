import { inspectOoxmlEntries, inspectPdfBounded } from '../file-intelligence/DocumentInspector';

interface SuiteResult { passed: number; total: number; }
export async function runDocumentInspectorTests(): Promise<SuiteResult> {
  let passed = 0, total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1; if (!condition) throw new Error(`DocumentInspector test failed: ${label}`);
    passed += 1; console.log(`✓ [PASS] ${label}`);
  };

  const nativePdf = new TextEncoder().encode('%PDF-1.7\n/Type /Page\n/Font 1 0 R\nBT (Hello) ET\n/Title (Annual Report)');
  const native = inspectPdfBounded(nativePdf);
  check(native.format === 'PDF' && native.contentMode === 'NATIVE_TEXT' && native.pageCount === 1, 'PDF native-text evidence and bounded page marker are detected');
  check(native.title === 'Annual Report', 'PDF bounded metadata title is extracted');

  const scannedPdf = new TextEncoder().encode('%PDF-1.7\n/Type /Page\n/Subtype /Image\n');
  const scanned = inspectPdfBounded(scannedPdf);
  check(scanned.contentMode === 'SCANNED_VISUAL' && scanned.hasImageEvidence, 'Image-only PDF evidence is classified as scanned visual');

  const mixedPdf = new TextEncoder().encode('%PDF-1.7\n/Type /Page\n/Font\nBT text ET\n/Subtype /Image');
  check(inspectPdfBounded(mixedPdf).contentMode === 'MIXED', 'PDF with text and image evidence is classified mixed');

  const docx = inspectOoxmlEntries({ names: ['[Content_Types].xml', 'word/document.xml', 'word/media/image1.png'] });
  check(docx.format === 'DOCX' && docx.contentMode === 'MIXED', 'DOCX package is identified by canonical OOXML entries');

  const xlsx = inspectOoxmlEntries({ names: ['xl/workbook.xml', 'xl/worksheets/sheet1.xml'] });
  check(xlsx.format === 'XLSX' && xlsx.hasNativeTextEvidence, 'XLSX package is identified from worksheet entries');

  const pptx = inspectOoxmlEntries({ names: ['ppt/presentation.xml', 'ppt/slides/slide1.xml'] });
  check(pptx.format === 'PPTX', 'PPTX package is identified from slide entries');

  const unknown = inspectOoxmlEntries({ names: ['random/file.xml'] });
  check(unknown.format === 'UNKNOWN' && unknown.contentMode === 'UNKNOWN', 'Unknown ZIP package is not guessed as Office');

  return { passed, total };
}
