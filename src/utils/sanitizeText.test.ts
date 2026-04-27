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

  it('removes BMP non-character U+FFFE between pé and direito (PDF glyph bug)', () => {
    expect(sanitizeText('pé\uFFFEdireito útil')).toBe('pé-direito útil');
    expect(sanitizeText('Pé\uFFFEdireito total')).toBe('Pé-direito total');
  });

  it('removes combining grapheme joiner (Cf) between pé and direito', () => {
    expect(sanitizeText('pé\u034Fdireito útil')).toBe('pé-direito útil');
  });

  it('normalizes spaced pé direito to hyphenated form', () => {
    expect(sanitizeText('Pé direito útil informado:')).toBe(
      'Pé-direito útil informado:'
    );
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

  it('maps Unicode hyphen, en dash, em dash and minus sign to ASCII hyphen', () => {
    expect(sanitizeText('a\u2010b\u2011c\u2012d\u2013e\u2014f')).toBe(
      'a-b-c-d-e-f'
    );
    expect(sanitizeText('x\u2212y')).toBe('x-y');
    expect(sanitizeText('z\uFF0Dw')).toBe('z-w');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeText('')).toBe('');
  });
});
