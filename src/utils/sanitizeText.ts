/**
 * Prepares user-facing strings for PDF/SVG rendering: Unicode normalization,
 * strips replacement and invisible characters. Input is treated as UTF-8 text
 * (JavaScript strings are UTF-16 code units; output is stable valid Unicode).
 */

/** Characters with no glyph width that often corrupt PDF/SVG text layout. */
const INVISIBLE_AND_FORMAT_CHARS =
  /[\u00AD\u034F\u061C\u115F\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB]/g;

/**
 * Normalizes text for rendering: NFKC (Unicode TR15), removes U+FFFD,
 * zero-width and other invisible format characters.
 */
export function sanitizeText(text: string): string {
  if (!text) {
    return '';
  }
  let s = text.normalize('NFKC');
  s = s.replace(/\uFFFD/g, '');
  s = s.replace(INVISIBLE_AND_FORMAT_CHARS, '');
  return s;
}
