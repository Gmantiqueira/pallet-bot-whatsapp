import { calculateBudget } from './budgetEngine';
import type { LayoutResult } from './layoutEngine';
import type { StructureResult } from './structureEngine';

const baseLayout = (overrides: Partial<LayoutResult> = {}): LayoutResult => ({
  rows: 2,
  modulesPerRow: 10,
  modulesTotal: 20,
  estimatedPositions: 0,
  ...overrides,
});

describe('BudgetEngine', () => {
  it('deve calcular posições corretamente', () => {
    const layout = baseLayout({ modulesTotal: 20 });
    const structure: StructureResult = { uprightType: '8T' };

    const result = calculateBudget({ layout, structure, levels: 3 });

    expect(result.totals.modules).toBe(20);
    expect(result.totals.positions).toBe(60);
  });

  it('deve gerar itens básicos', () => {
    const layout = baseLayout({
      rows: 2,
      modulesPerRow: 3,
      modulesTotal: 6,
    });
    const structure: StructureResult = { uprightType: '8T' };

    const result = calculateBudget({ layout, structure, levels: 4 });

    // montantes: (modulesPerRow + 1) * rows = (3 + 1) * 2 = 8
    // pares de longarinas: modules * levels = 6 * 4 = 24
    expect(result.items).toEqual(
      expect.arrayContaining([
        { name: 'Montante 8T', quantity: 8 },
        { name: 'Par de Longarinas', quantity: 24 },
      ]),
    );
    expect(result.items).toHaveLength(2);
  });
});
