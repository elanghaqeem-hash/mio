export type OoxmlTextKind = 'DOCX' | 'PPTX' | 'XLSX_SHARED_STRINGS' | 'XLSX_WORKSHEET';

export interface OoxmlTextExtraction {
  kind: OoxmlTextKind;
  text: string;
  segments: string[];
  truncated: boolean;
  analyzerVersion: 'mio-ooxml-text-v1';
}

const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;

const decodeEntities = (value: string): string => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

function extractTextNodes(xmlBytes: Uint8Array, tag: 'w:t' | 'a:t' | 't'): { segments: string[]; truncated: boolean } {
  if (xmlBytes.byteLength > MAX_XML_BYTES) throw new Error('OOXML XML entry exceeds 2MiB bounded extraction limit');
  const xml = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes);
  const escaped = tag.replace(':', '\\:');
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  const segments: string[] = [];
  let chars = 0, truncated = false, match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    const clean = decodeEntities(match[1].replace(/<[^>]+>/g, '')).replace(/\s+/gu, ' ').trim();
    if (!clean) continue;
    if (chars + clean.length > MAX_TEXT_CHARS) { truncated = true; break; }
    segments.push(clean); chars += clean.length;
  }
  return { segments, truncated };
}

export function extractOoxmlNativeText(kind: OoxmlTextKind, xmlBytes: Uint8Array): OoxmlTextExtraction {
  const tag = kind === 'DOCX' ? 'w:t' : kind === 'PPTX' ? 'a:t' : 't';
  const { segments, truncated } = extractTextNodes(xmlBytes, tag);
  return {
    kind,
    text: segments.join(' ').replace(/\s+/gu, ' ').trim(),
    segments,
    truncated,
    analyzerVersion: 'mio-ooxml-text-v1',
  };
}

export function selectOoxmlTextEntries(names: readonly string[]): string[] {
  return names.map((name) => name.replace(/\\/g, '/')).filter((name) =>
    name === 'word/document.xml' ||
    /^ppt\/slides\/slide\d+\.xml$/i.test(name) ||
    name === 'xl/sharedStrings.xml' ||
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
  ).sort((a, b) => a.localeCompare(b));
}
