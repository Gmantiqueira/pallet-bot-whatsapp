import { generateFloorPlanSvg, generateFrontViewSvg } from './drawingEngine';
import type { LayoutResult } from './layoutEngine';

/** Posições x,y declaradas em elementos <text> (atributos no cabeçalho da tag). */
function collectTextAnchors(svg: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const chunks = svg.split('<text');
  for (let i = 1; i < chunks.length; i++) {
    const head = chunks[i].split('>')[0];
    const xm = head.match(/\bx="([\d.]+)"/);
    const ym = head.match(/\by="([\d.]+)"/);
    if (xm && ym) {
      out.push({ x: parseFloat(xm[1]), y: parseFloat(ym[1]) });
    }
  }
  return out;
}

function anchorsAreUnique(svg: string): boolean {
  const seen = new Set<string>();
  for (const p of collectTextAnchors(svg)) {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }
  return true;
}

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
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+960\s+840"/);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('DETALHE TÉCNICO');
    expect(svg).toContain('Elevação frontal');
    expect(svg).toContain('stroke="#0f172a"');
    expect(svg).toContain('stroke="#ea580c"');
    expect(svg).toContain('stroke="#fdba74"');
    expect(svg).toContain('fill="#1e293b"');
    expect(svg).toContain('altura total');
    expect(svg).toContain('entre níveis');
    expect(svg).toContain('largura total (vãos + folgas)');
    expect(svg).toMatch(/<line[^>]+>/);
  });

  it('deve incluir kg, mm, vários vãos e cotas com traços diagonais', () => {
    const svg = generateFrontViewSvg({
      levels: 4,
      uprightHeightMm: 8000,
      beamWidthMm: 2310,
      depthMm: 1100,
      capacityKgPerLevel: 2000,
    });

    expect(svg).toContain('kg');
    expect(svg).toContain('mm');
    expect(svg).toContain('2000kg');
    expect(svg).toContain('Config: 4 níveis de 2000kg | Prof: 1100mm');
    expect(svg).toContain('2310 | 75 | 2310 | 75 | 2310');
    const uprightRects = svg.match(/<rect[^>]*fill="#1e293b"/g) || [];
    expect(uprightRects.length).toBe(4);
    expect(anchorsAreUnique(svg)).toBe(true);
  });

  it('deve funcionar com diferentes níveis', () => {
    const svg3 = generateFrontViewSvg({
      levels: 3,
      uprightHeightMm: 9000,
      beamWidthMm: 1100,
      depthMm: 2700,
      capacityKgPerLevel: 1200,
    });
    expect(svg3).toContain('Config: 3 níveis de 1200kg | Prof: 2700mm');
    expect(svg3).toContain('entre níveis');

    const svg1 = generateFrontViewSvg({
      levels: 1,
      uprightHeightMm: 5000,
      beamWidthMm: 1100,
      depthMm: 2700,
      capacityKgPerLevel: 500,
    });
    expect(svg1).toContain('Config: 1 níveis de 500kg | Prof: 2700mm');
    expect(svg1).not.toContain('entre níveis');

    const svg12 = generateFrontViewSvg({
      levels: 12,
      uprightHeightMm: 12000,
      beamWidthMm: 3300,
      depthMm: 1100,
      capacityKgPerLevel: 1500,
    });
    expect(svg12).toContain('Config: 12 níveis de 1500kg | Prof: 1100mm');
    expect(anchorsAreUnique(svg12)).toBe(true);
    expect(() => svg12).not.toThrow();
  });
});
