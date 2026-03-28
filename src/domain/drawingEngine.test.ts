import { generateFloorPlanSvg, generateFrontViewSvg } from './drawingEngine';
import type { LayoutResult } from './layoutEngine';

describe('DrawingEngine', () => {
  it('deve gerar SVG válido', () => {
    const layout: LayoutResult = {
      rows: 2,
      modulesPerRow: 5,
      modulesTotal: 10,
      estimatedPositions: 0,
    };

    const svg = generateFloorPlanSvg(layout, {
      lengthMm: 12000,
      widthMm: 10000,
    });

    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+880\s+660"/);
    expect(svg).toContain('width="100%"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('PLANTA DO GALPÃO');
    expect(svg).toContain('12.000 mm');
    expect(svg).toContain('10.000 mm');
    expect(svg).toContain('×');
    expect(svg).toContain('Linhas:');
    expect(svg).toContain('Módulos por linha:');
    expect(svg).toMatch(/Total de módulos:<\/tspan>\s*10</);
  });

  it('não deve quebrar com valores grandes', () => {
    const layout: LayoutResult = {
      rows: 40,
      modulesPerRow: 60,
      modulesTotal: 2400,
      estimatedPositions: 0,
    };

    expect(() =>
      generateFloorPlanSvg(layout, {
        lengthMm: 80000,
        widthMm: 11200,
      })
    ).not.toThrow();

    const svg = generateFloorPlanSvg(layout, {
      lengthMm: 80000,
      widthMm: 11200,
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('80.000 mm');
    expect(svg).toContain('11.200 mm');
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+880\s+660"/);
    const rectCount = (svg.match(/<rect/g) || []).length;
    expect(rectCount).toBeGreaterThan(40 * 60);
  });
});

describe('generateFrontViewSvg', () => {
  it('deve gerar SVG válido', () => {
    const svg = generateFrontViewSvg({
      levels: 4,
      uprightHeightMm: 8000,
      beamWidthMm: 2700,
      depthMm: 1100,
      capacityKgPerLevel: 2000,
    });

    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+880\s+780"/);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('DETALHE TÉCNICO');
    expect(svg).toContain('Elevação frontal');
    expect(svg).toContain('stroke="#0f172a"');
    expect(svg).toContain('stroke="#2563eb"');
    expect(svg).toContain('Níveis: 4');
    expect(svg).toContain('Capacidade por nível:');
    expect(svg).toContain('2.000');
    expect(svg).toContain('altura total');
    expect(svg).toContain('entre níveis');
    expect(svg).toContain('largura longarina');
    expect(svg).toMatch(/<line[^>]+>/);
  });

  it('deve funcionar com diferentes níveis', () => {
    const svg3 = generateFrontViewSvg({
      levels: 3,
      uprightHeightMm: 9000,
      beamWidthMm: 1100,
      depthMm: 2700,
      capacityKgPerLevel: 1200,
    });
    expect(svg3).toContain('Níveis: 3');
    expect(svg3).toContain('entre níveis');

    const svg1 = generateFrontViewSvg({
      levels: 1,
      uprightHeightMm: 5000,
      beamWidthMm: 1100,
      depthMm: 2700,
      capacityKgPerLevel: 500,
    });
    expect(svg1).toContain('Níveis: 1');
    expect(svg1).not.toContain('entre níveis');

    const svg12 = generateFrontViewSvg({
      levels: 12,
      uprightHeightMm: 12000,
      beamWidthMm: 3300,
      depthMm: 1100,
      capacityKgPerLevel: 1500,
    });
    expect(svg12).toContain('Níveis: 12');
    expect(() => svg12).not.toThrow();
  });
});
