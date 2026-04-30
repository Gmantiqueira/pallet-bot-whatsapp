import {
  parseModuleIndexList,
  parseModuleIndexListResult,
} from './conversationHelpers';

describe('parseModuleIndexListResult', () => {
  it('aceita vírgula, espaço, «e», ponto entre dígitos; desduplica e ordena', () => {
    expect(parseModuleIndexListResult('2, 5, 8')).toEqual({
      ok: true,
      indices: [2, 5, 8],
    });
    expect(parseModuleIndexListResult('8,2,2')).toEqual({
      ok: true,
      indices: [2, 8],
    });
    expect(parseModuleIndexListResult('2 5')).toEqual({
      ok: true,
      indices: [2, 5],
    });
    expect(parseModuleIndexListResult('2 e 5')).toEqual({
      ok: true,
      indices: [2, 5],
    });
    expect(parseModuleIndexListResult('2.5')).toEqual({
      ok: true,
      indices: [2, 5],
    });
    expect(parseModuleIndexListResult('2,5')).toEqual({
      ok: true,
      indices: [2, 5],
    });
    expect(parseModuleIndexListResult(' 2 . 5 . 8 ')).toEqual({
      ok: true,
      indices: [2, 5, 8],
    });
    expect(parseModuleIndexListResult('10.20')).toEqual({
      ok: true,
      indices: [10, 20],
    });
  });

  it('aceita ponto e vírgula e a palavra módulos', () => {
    expect(parseModuleIndexListResult('Módulos 2 e 6')).toEqual({
      ok: true,
      indices: [2, 6],
    });
    expect(parseModuleIndexListResult('1;3;1')).toEqual({
      ok: true,
      indices: [1, 3],
    });
  });

  it('rejeita entrada vazia ou sem números válidos', () => {
    expect(parseModuleIndexListResult('  ').ok).toBe(false);
    const letters = parseModuleIndexListResult('abc');
    expect(letters.ok).toBe(false);
    if (!letters.ok) {
      expect(letters.error.length).toBeGreaterThan(10);
    }
  });

  it('rejeita tokens com símbolos ambíguos (ex.: «2..5»)', () => {
    const r = parseModuleIndexListResult('2..5');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('2..5');
    }
  });
});

describe('parseModuleIndexList', () => {
  it('retorna [] quando o resultado não é ok', () => {
    expect(parseModuleIndexList('  ')).toEqual([]);
    expect(parseModuleIndexList('abc')).toEqual([]);
  });

  it('«2.5» não produz 25', () => {
    expect(parseModuleIndexList('2.5')).toEqual([2, 5]);
  });
});
