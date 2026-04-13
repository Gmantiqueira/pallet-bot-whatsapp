import {
  loadKgPerModule,
  selectColumnTypeFromLoadTon,
  selectStructure,
} from './structureEngine';

describe('StructureEngine', () => {
  it('selectColumnTypeFromLoadTon: menor capacidade da tabela ≥ carga (ton)', () => {
    expect(selectColumnTypeFromLoadTon(7).uprightType).toBe('8T');
    expect(selectColumnTypeFromLoadTon(8).uprightType).toBe('8T');
    expect(selectColumnTypeFromLoadTon(8.001).uprightType).toBe('12T');
    expect(selectColumnTypeFromLoadTon(9).uprightType).toBe('12T');
    expect(selectColumnTypeFromLoadTon(12).uprightType).toBe('12T');
    expect(selectColumnTypeFromLoadTon(13).uprightType).toBe('15T');
    expect(selectColumnTypeFromLoadTon(15).uprightType).toBe('15T');
  });

  it('selectColumnTypeFromLoadTon: acima de 15 t mantém 15T e assinala excesso', () => {
    const r = selectColumnTypeFromLoadTon(16);
    expect(r.uprightType).toBe('15T');
    expect(r.loadExceedsTableMax).toBe(true);
  });

  it('carga por módulo = kg/nível × patamares × baias (padrão 2)', () => {
    const kg = loadKgPerModule({
      capacityKgPerLevel: 1000,
      levels: 4,
      hasGroundLevel: true,
    });
    expect(kg).toBe(1000 * (4 + 1) * 2);
    expect(selectStructure({
      capacityKgPerLevel: 1000,
      levels: 4,
      hasGroundLevel: true,
    }).loadTonPerModule).toBe(10);
    expect(
      selectStructure({
        capacityKgPerLevel: 1000,
        levels: 4,
        hasGroundLevel: true,
      }).uprightType
    ).toBe('12T');
  });

  it('sem piso: só níveis estruturais entram no somatório', () => {
    const r = selectStructure({
      capacityKgPerLevel: 2000,
      levels: 4,
      hasGroundLevel: false,
    });
    expect(r.loadTonPerModule).toBe((2000 * 4 * 2) / 1000);
    expect(r.uprightType).toBe('15T');
  });
});
