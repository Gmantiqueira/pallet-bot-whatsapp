import { sanitizeText } from './sanitizeText';

describe('sanitizeText', () => {
  it('removes word joiner between pé and direito and restores hyphen', () => {
    expect(sanitizeText('pé\u2060direito')).toBe('pé-direito');
  });

  it('normalizes Unicode hyphen between pé and direito to ASCII hyphen', () => {
    expect(sanitizeText('pé\u2011direito útil')).toBe('pé-direito útil');
  });

  it('removes soft hyphen between pé and direito and restores readable form', () => {
    expect(sanitizeText('pé\u00ADdireito')).toBe('pé-direito');
  });

  it('removes U+FFFD replacement character', () => {
    expect(sanitizeText('ok\uFFFD!')).toBe('ok!');
  });

  it('removes zero-width space and BOM', () => {
    expect(sanitizeText('a\u200Bb\uFEFFc')).toBe('abc');
  });

  it('leaves normal Portuguese text unchanged', () => {
    expect(sanitizeText('Pé-direito total: 5.040 mm')).toBe(
      'Pé-direito total: 5.040 mm'
    );
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeText('')).toBe('');
  });
});
