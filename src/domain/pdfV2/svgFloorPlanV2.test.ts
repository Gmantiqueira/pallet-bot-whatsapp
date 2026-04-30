import { planModuleFaceLabel } from './svgFloorPlanV2';

describe('planModuleFaceLabel', () => {
  it('full module: decimal string', () => {
    expect(planModuleFaceLabel({ displayIndex: 9, segmentType: 'full' })).toBe(
      '9'
    );
    expect(planModuleFaceLabel({ displayIndex: 10 })).toBe('10');
  });

  it('half module: «N 1/2» quando há inteiro anterior na face', () => {
    expect(
      planModuleFaceLabel({
        segmentType: 'half',
        halfAfterFullDisplayIndex: 11,
      })
    ).toBe('11 1/2');
    expect(
      planModuleFaceLabel({
        segmentType: 'half',
        halfAfterFullDisplayIndex: 22,
      })
    ).toBe('22 1/2');
  });

  it('half module: só fração quando não há âncora na face', () => {
    expect(planModuleFaceLabel({ segmentType: 'half' })).toBe('1/2');
  });

  it('half module: displayIndex é ignorado sem halfAfterFullDisplayIndex', () => {
    expect(planModuleFaceLabel({ displayIndex: 99, segmentType: 'half' })).toBe(
      '1/2'
    );
  });

  it('tunnel: T', () => {
    expect(planModuleFaceLabel({ variant: 'tunnel' })).toBe('T');
  });
});
