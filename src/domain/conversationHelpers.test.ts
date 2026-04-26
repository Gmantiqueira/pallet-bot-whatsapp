import { parseModuleIndexList } from './conversationHelpers';

describe('parseModuleIndexList', () => {
  it('aceita vírgulas e desduplica/ordena', () => {
    expect(parseModuleIndexList('2, 5, 8')).toEqual([2, 5, 8]);
    expect(parseModuleIndexList('8,2,2')).toEqual([2, 8]);
  });

  it('aceita ponto e vírgula, e, e a palavra módulos', () => {
    expect(parseModuleIndexList('Módulos 2 e 6')).toEqual([2, 6]);
    expect(parseModuleIndexList('1;3;1')).toEqual([1, 3]);
  });

  it('retorna vazio se não houver inteiros', () => {
    expect(parseModuleIndexList('  ')).toEqual([]);
    expect(parseModuleIndexList('abc')).toEqual([]);
  });
});
