import { generateIsometricView } from './isometricDrawingEngine';

const baseInput = () => ({
  rows: 2,
  modulesPerRow: 5,
  levels: 4,
  moduleWidthMm: 1100,
  moduleDepthMm: 2700,
  uprightHeightMm: 8000,
});

describe('generateIsometricView', () => {
  it('deve gerar SVG válido', () => {
    const svg = generateIsometricView(baseInput());

    expect(svg.length).toBeGreaterThan(100);
    expect(svg.trim().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox="\s*0\s+0\s+880\s+720"/);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('VISTA 3D');
    expect(svg).toContain('<line ');
    expect(svg).toContain('stroke="#0f172a"');
  });

  it('deve funcionar com diferentes rows e modulesPerRow', () => {
    const svg1 = generateIsometricView({
      ...baseInput(),
      rows: 1,
      modulesPerRow: 3,
      levels: 2,
    });
    expect(svg1).toContain('<svg');
    expect(svg1.length).toBeGreaterThan(200);

    const svg2 = generateIsometricView({
      ...baseInput(),
      rows: 6,
      modulesPerRow: 12,
      levels: 3,
    });
    expect(svg2).toContain('<svg');
    const lines1 = (svg1.match(/<line /g) || []).length;
    const lines2 = (svg2.match(/<line /g) || []).length;
    expect(lines2).toBeGreaterThan(lines1);
  });

  it('não deve retornar string vazia', () => {
    expect(generateIsometricView(baseInput()).trim()).not.toBe('');
    expect(
      generateIsometricView({
        rows: 1,
        modulesPerRow: 1,
        levels: 1,
        moduleWidthMm: 1000,
        moduleDepthMm: 1000,
        uprightHeightMm: 4000,
      }).trim()
    ).not.toBe('');
  });
});
