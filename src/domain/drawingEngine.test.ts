import { generateFloorPlanSvg } from './drawingEngine';
import type { LayoutResult } from './layoutEngine';

describe('DrawingEngine', () => {
  it('deve gerar string SVG válida', () => {
    const layout: LayoutResult = {
      rows: 2,
      modulesPerRow: 5,
      modulesTotal: 10,
      estimatedPositions: 0,
    };

    const svg = generateFloorPlanSvg(layout);

    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+[\d.]+\s+[\d.]+"/);
    expect(svg).toContain('<rect');
  });
});
