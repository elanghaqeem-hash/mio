import { extractOoxmlNativeText, selectOoxmlTextEntries } from '../file-intelligence/OoxmlTextExtractor';

interface SuiteResult { passed: number; total: number; }
export async function runOoxmlTextExtractorTests(): Promise<SuiteResult> {
  let passed = 0, total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1; if (!condition) throw new Error(`OoxmlTextExtractor test failed: ${label}`);
    passed += 1; console.log(`✓ [PASS] ${label}`);
  };
  const enc = new TextEncoder();

  const docx = extractOoxmlNativeText('DOCX', enc.encode('<w:document><w:p><w:r><w:t>Hello &amp; Mio</w:t></w:r></w:p><w:t>Second</w:t></w:document>'));
  check(docx.text === 'Hello & Mio Second' && docx.segments.length === 2, 'DOCX w:t nodes extract and decode XML entities');

  const pptx = extractOoxmlNativeText('PPTX', enc.encode('<p:sld><a:t>Quarterly</a:t><a:t>Review</a:t></p:sld>'));
  check(pptx.text === 'Quarterly Review', 'PPTX a:t nodes extract in deterministic order');

  const shared = extractOoxmlNativeText('XLSX_SHARED_STRINGS', enc.encode('<sst><si><t>Revenue</t></si><si><t>2026</t></si></sst>'));
  check(shared.text === 'Revenue 2026', 'XLSX shared strings are extracted');

  const entries = selectOoxmlTextEntries(['ppt/slides/slide2.xml','docProps/core.xml','ppt/slides/slide1.xml','word/media/x.png']);
  check(entries.join(',') === 'ppt/slides/slide1.xml,ppt/slides/slide2.xml', 'Text-bearing package entries are selected and sorted');

  let bounded = false;
  try { extractOoxmlNativeText('DOCX', new Uint8Array(2 * 1024 * 1024 + 1)); } catch { bounded = true; }
  check(bounded, 'Oversized XML entry is rejected before parsing');

  return { passed, total };
}
