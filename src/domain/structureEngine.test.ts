import { selectStructure } from './structureEngine';

describe('StructureEngine', () => {
  it('deve retornar 8T para carga baixa', () => {
    const result = selectStructure({
      capacityKgPerLevel: 2000,
      uprightHeightMm: 6000,
      levels: 4,
    });

    expect(result.uprightType).toBe('8T');
  });

  it('deve retornar 15T para carga alta', () => {
    const result = selectStructure({
      capacityKgPerLevel: 2001,
      uprightHeightMm: 6000,
      levels: 4,
    });

    expect(result.uprightType).toBe('15T');
  });
});
