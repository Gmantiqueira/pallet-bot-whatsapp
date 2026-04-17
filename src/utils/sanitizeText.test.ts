import { sanitizeText } from './sanitizeText';

describe('sanitizeText', () => {
  it('applies NFKC and removes word joiner between letters', () => {
    expect(sanitizeText('pé\u2060direito')).toBe('pédireito');
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
