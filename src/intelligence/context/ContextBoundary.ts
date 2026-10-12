// MIO-PRV-03 / PRV-06: context data is wrapped in labelled blocks such as
// [APPLICATION_CONTEXT ...] … [/APPLICATION_CONTEXT]. Untrusted text must never be able to close
// or open those blocks itself (boundary spoofing), nor inject attributes such as trust="VERIFIED".

/** Every block tag MIO uses to frame data for a model. */
export const MIO_CONTEXT_BOUNDARY_TAGS = [
  'APPLICATION_CONTEXT',
  'CONTEXT_SOURCE',
  'MIO_MEMORY_CONTEXT',
  'MEMORY_SOURCE',
  'UNTRUSTED_EXTERNAL_DATA',
  'MIO_CONTEXT',
  'MIO_CONTEXT_ITEM',
] as const;

const TAG_PATTERN = new RegExp(`\\[(\\s*\\/?\\s*)(${MIO_CONTEXT_BOUNDARY_TAGS.join('|')})\\b`, 'gi');

/**
 * Defangs any MIO boundary tag inside untrusted text by swapping the ASCII bracket for a fullwidth one.
 * The text stays readable, but it can no longer be confused with a real block boundary.
 */
export function neutralizeContextBoundaries(text: string): string {
  return text.replace(TAG_PATTERN, (_match, slash: string, tag: string) => `［${slash}${tag}`);
}

/** Escapes a value for use inside a quoted block attribute: no quotes, brackets, or line breaks. */
export function escapeContextAttribute(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .slice(0, 300);
}

/** True when the text contains something that looks like a MIO block boundary. */
export function containsContextBoundary(text: string): boolean {
  TAG_PATTERN.lastIndex = 0;
  const found = TAG_PATTERN.test(text);
  TAG_PATTERN.lastIndex = 0;
  return found;
}
