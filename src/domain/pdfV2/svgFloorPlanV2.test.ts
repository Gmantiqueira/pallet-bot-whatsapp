import { planModuleFaceLabel } from './svgFloorPlanV2';

describe('planModuleFaceLabel', () => {
  it('full module: decimal string', () => {
    expect(planModuleFaceLabel({ displayIndex: 9, segmentType: 'full' })).toBe(
      '9'
    );
    expect(planModuleFaceLabel({ displayIndex: 10 })).toBe('10');
  });

  it('half module: apenas fração, sem numeração', () => {
    expect(planModuleFaceLabel({ segmentType: 'half' })).toBe('1/2');
    expect(planModuleFaceLabel({ displayIndex: 99, segmentType: 'half' })).toBe(
      '1/2'
    );
  });

  it('tunnel: T', () => {
    expect(planModuleFaceLabel({ variant: 'tunnel' })).toBe('T');
  });
});
