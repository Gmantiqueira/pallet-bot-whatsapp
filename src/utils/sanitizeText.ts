/**
 * Prepares user-facing strings for PDF/SVG rendering: Unicode normalization,
 * strips replacement and invisible characters. Input is treated as UTF-8 text
 * (JavaScript strings are UTF-16 code units; output is stable valid Unicode).
 */

/** Characters with no glyph width that often corrupt PDF/SVG text layout. */
const INVISIBLE_AND_FORMAT_CHARS =
  /[\u00AD\u034F\u061C\u115F\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB]/g;

/** Unicode hyphen / minus variants → ASCII hyphen for stable PDF glyph layout. */
const PEDIREITO_HYPHEN_ALT = '(?:\u2010|\u2011|\u2012|\uFE63|\uFF0D)';

/**
 * After stripping invisibles, "pé" + "direito" may merge as "pédireito"; NFKC may
 * yield U+2010 between words. Normalize to ASCII "pé-direito" for legible output.
 */
function normalizePedireitoCompound(s: string): string {
  return s
    .replace(
      new RegExp(`PÉ${PEDIREITO_HYPHEN_ALT}DIREITO`, 'g'),
      'PÉ-DIREITO'
    )
    .replace(
      new RegExp(`Pé${PEDIREITO_HYPHEN_ALT}direito`, 'g'),
      'Pé-direito'
    )
    .replace(
      new RegExp(`pé${PEDIREITO_HYPHEN_ALT}direito`, 'g'),
      'pé-direito'
    )
    .replace(/PÉDIREITO/g, 'PÉ-DIREITO')
    .replace(/Pédireito/g, 'Pé-direito')
    .replace(/pédireito/g, 'pé-direito');
}

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
  s = normalizePedireitoCompound(s);
  return s;
}
