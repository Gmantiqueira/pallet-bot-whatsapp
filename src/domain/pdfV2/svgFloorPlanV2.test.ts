import { planModuleFaceLabel } from './svgFloorPlanV2';

describe('planModuleFaceLabel', () => {
  it('full module: decimal string', () => {
    expect(planModuleFaceLabel(9, 'full')).toBe('9');
    expect(planModuleFaceLabel(10, undefined)).toBe('10');
  });

  it('half module: vulgar fraction after previous index', () => {
    expect(planModuleFaceLabel(10, 'half')).toBe('9½');
    expect(planModuleFaceLabel(2, 'half')).toBe('1½');
  });

  it('half module at first slot: texto fixo', () => {
    expect(planModuleFaceLabel(1, 'half')).toBe('Meio módulo');
  });
});
