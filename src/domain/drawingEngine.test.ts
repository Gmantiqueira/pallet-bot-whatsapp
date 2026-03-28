import { generateFloorPlanSvg, generateFrontViewSvg } from './drawingEngine';
import type { LayoutResult } from './layoutEngine';

describe('DrawingEngine', () => {
  it('deve gerar string SVG válida', () => {
    const layout: LayoutResult = {
      rows: 2,
      modulesPerRow: 5,
      modulesTotal: 10,
      estimatedPositions: 0,
    };

    const svg = generateFloorPlanSvg(layout, {
      warehouseWidthMm: 10000,
      warehouseLengthMm: 12000,
    });

    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+[\d.]+\s+[\d.]+"/);
    expect(svg).toContain('<rect');
    expect(svg).toContain('PLANTA DO GALPÃO');
    expect(svg).toContain('Largura total:');
    expect(svg).toContain('10.000 mm');
    expect(svg).toContain('Comprimento total:');
    expect(svg).toContain('12.000 mm');
    expect(svg).toContain('Número de linhas:');
    expect(svg).toContain('Módulos por linha:');
  });

  it('deve permanecer legível com muitos módulos', () => {
    const layout: LayoutResult = {
      rows: 35,
      modulesPerRow: 48,
      modulesTotal: 35 * 48,
      estimatedPositions: 0,
    };

    const svg = generateFloorPlanSvg(layout, {
      warehouseWidthMm: 50000,
      warehouseLengthMm: 120000,
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('PLANTA DO GALPÃO');
    const vb = svg.match(/viewBox="\s*0\s+0\s+([\d.]+)\s+([\d.]+)"/);
    expect(vb).not.toBeNull();
    const w = parseFloat(vb![1]);
    const h = parseFloat(vb![2]);
    expect(w).toBeLessThan(1200);
    expect(h).toBeLessThan(900);
    const rectCount = (svg.match(/<rect/g) || []).length;
    expect(rectCount).toBeGreaterThan(35 * 48);
  });
});

describe('generateFrontViewSvg', () => {
  it('deve gerar string SVG válida', () => {
    const svg = generateFrontViewSvg({
      levels: 4,
      totalHeightMm: 8000,
      beamWidthMm: 2700,
      depthMm: 1100,
      capacityKgPerLevel: 1500,
    });

    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('VISTA FRONTAL');
    expect(svg).toContain('Nível');
    expect(svg).toContain('Cota altura');
    expect(svg).toContain('Cota largura');
    expect(svg).toContain('Profundidade:');
    expect(svg).toContain('Capacidade por nível:');
    expect(svg).toContain('1.500');
    expect(svg).toMatch(/<line[^>]+>/);
  });
});
