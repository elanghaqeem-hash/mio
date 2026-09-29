export type DocumentFormat = 'PDF' | 'DOCX' | 'XLSX' | 'PPTX' | 'UNKNOWN';
export type DocumentContentMode = 'NATIVE_TEXT' | 'SCANNED_VISUAL' | 'MIXED' | 'UNKNOWN';

export interface DocumentInspection {
  format: DocumentFormat;
  mimeType?: string;
  contentMode: DocumentContentMode;
  pageCount?: number;
  hasNativeTextEvidence: boolean;
  hasImageEvidence: boolean;
  title?: string;
  analyzerVersion: 'mio-document-inspector-v1';
}

const ascii = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

export function inspectPdfBounded(bytes: Uint8Array): DocumentInspection {
  const text = ascii(bytes);
  if (!text.startsWith('%PDF-')) throw new Error('Not a PDF header');
  const pageMatches = text.match(/\/Type\s*\/Page\b/g) ?? [];
  const hasNativeTextEvidence = /\bBT\b[\s\S]*?\bET\b/.test(text) || /\/Font\b/.test(text);
  const hasImageEvidence = /\/Subtype\s*\/Image\b/.test(text);
  const contentMode: DocumentContentMode =
    hasNativeTextEvidence && hasImageEvidence ? 'MIXED' :
    hasNativeTextEvidence ? 'NATIVE_TEXT' :
    hasImageEvidence ? 'SCANNED_VISUAL' : 'UNKNOWN';
  const titleMatch = text.match(/\/Title\s*\(([^)]{1,256})\)/);
  return {
    format: 'PDF',
    mimeType: 'application/pdf',
    contentMode,
    pageCount: pageMatches.length || undefined,
    hasNativeTextEvidence,
    hasImageEvidence,
    title: titleMatch?.[1]?.trim() || undefined,
    analyzerVersion: 'mio-document-inspector-v1',
  };
}

export interface OoxmlEntryEvidence {
  names: readonly string[];
}

export function inspectOoxmlEntries(evidence: OoxmlEntryEvidence): DocumentInspection {
  const names = evidence.names.map((name) => name.replace(/\\/g, '/').toLowerCase());
  const word = names.some((name) => name === 'word/document.xml');
  const sheet = names.some((name) => name.startsWith('xl/worksheets/') && name.endsWith('.xml'));
  const slides = names.some((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const format: DocumentFormat = word ? 'DOCX' : sheet ? 'XLSX' : slides ? 'PPTX' : 'UNKNOWN';
  const mimeType = format === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : format === 'XLSX' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : format === 'PPTX' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    : undefined;
  const hasImageEvidence = names.some((name) => /^(word|xl|ppt)\/media\//.test(name));
  return {
    format,
    mimeType,
    contentMode: format === 'UNKNOWN' ? 'UNKNOWN' : hasImageEvidence ? 'MIXED' : 'NATIVE_TEXT',
    hasNativeTextEvidence: format !== 'UNKNOWN',
    hasImageEvidence,
    analyzerVersion: 'mio-document-inspector-v1',
  };
}
