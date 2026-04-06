import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import type { ProjectAnswersV2 } from './answerMapping';

const base = (): ProjectAnswersV2 => ({
  lengthMm: 40_000,
  widthMm: 16_000,
  corridorMm: 3000,
  moduleDepthMm: 2700,
  moduleWidthMm: 1100,
  levels: 4,
  capacityKg: 2000,
  lineStrategy: 'MELHOR_LAYOUT',
  moduleOrientation: 'HORIZONTAL',
  hasTunnel: false,
  halfModuleOptimization: false,
  firstLevelOnGround: true,
  heightMode: 'DIRECT',
  heightMm: 8000,
});

describe('buildLayoutSolutionV2', () => {
  it('1: uma fileira simples (estratégia só simples)', () => {
    const a = { ...base(), lineStrategy: 'APENAS_SIMPLES' as const };
    const s = buildLayoutSolutionV2(a);
    expect(s.rackDepthMode).toBe('single');
    expect(s.rows.length).toBeGreaterThanOrEqual(1);
    expect(s.rows[0].kind).toBe('single');
  });

  it('2: uma fileira dupla costas (estratégia só duplos)', () => {
    const a = { ...base(), lineStrategy: 'APENAS_DUPLOS' as const };
    const s = buildLayoutSolutionV2(a);
    expect(s.rackDepthMode).toBe('double');
    expect(s.rows[0].kind).toBe('double');
  });

  it('3: duas fileiras com corredor central', () => {
    const a = {
      ...base(),
      widthMm: 14_000,
      corridorMm: 3000,
      moduleDepthMm: 2700,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    const singles = s.rows.filter(r => r.kind === 'single');
    expect(singles.length).toBeGreaterThanOrEqual(2);
    expect(s.corridors.length).toBeGreaterThanOrEqual(1);
  });

  it('4: túnel no início', () => {
    const a = {
      ...base(),
      hasTunnel: true,
      tunnelPosition: 'INICIO' as const,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.tunnels.length).toBe(0);
    expect(s.rows.some(r => r.modules.some(m => m.variant === 'tunnel'))).toBe(true);
    expect(s.rows.some(r => r.modules.length > 0)).toBe(true);
  });

  it('5: túnel no centro', () => {
    const a = {
      ...base(),
      hasTunnel: true,
      tunnelPosition: 'MEIO' as const,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.tunnels.length).toBe(0);
    const firstRow = s.rows[0];
    const xs = firstRow.modules.map(m => m.x0);
    const gap = Math.min(...xs.filter(x => x > 1000));
    expect(gap).toBeGreaterThan(1000);
  });

  it('6: túnel no fim', () => {
    const a = {
      ...base(),
      hasTunnel: true,
      tunnelPosition: 'FIM' as const,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.tunnels.length).toBe(0);
    expect(s.rows.some(r => r.modules.some(m => m.variant === 'tunnel'))).toBe(true);
  });

  it('7: meio módulo aceito (com túnel adjacente / extremos)', () => {
    const a = {
      ...base(),
      lengthMm: 40_000,
      halfModuleOptimization: true,
      hasTunnel: true,
      tunnelPosition: 'MEIO' as const,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    const hasHalf = s.rows.some(r => r.modules.some(m => m.type === 'half'));
    expect(hasHalf).toBe(true);
  });

  it('8: meio módulo rejeitado sem circulação (1 fileira, sem túnel)', () => {
    const a = {
      ...base(),
      lengthMm: 10_450,
      widthMm: 6000,
      corridorMm: 3000,
      halfModuleOptimization: true,
      hasTunnel: false,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    const hasHalf = s.rows.some(r => r.modules.some(m => m.type === 'half'));
    expect(hasHalf).toBe(false);
    expect(s.metadata.halfModuleRejectedReason).toBeDefined();
  });

  it('9: túnel no centro deixa vazio ao centro (dois blocos nas extremidades)', () => {
    const a = {
      ...base(),
      hasTunnel: true,
      tunnelPosition: 'MEIO' as const,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    const m = s.rows[0].modules;
    expect(s.tunnels.length).toBe(0);
    const tunnelMod = m.find(mod => mod.variant === 'tunnel');
    expect(tunnelMod).toBeDefined();
    if (!tunnelMod) return;
    const beam = { x0: tunnelMod.x0, x1: tunnelMod.x1 };
    const maxLeft = Math.max(...m.filter(mod => mod.x1 <= beam.x0 + 1).map(mod => mod.x1), -1);
    const minRight = Math.min(...m.filter(mod => mod.x0 >= beam.x1 - 1).map(mod => mod.x0), Infinity);
    expect(maxLeft).toBeGreaterThan(0);
    expect(minRight).toBeLessThan(Infinity);
    expect(minRight - maxLeft).toBeGreaterThan(0);
  });

  it('10: orientação acompanha a largura (vertical no fluxo)', () => {
    const a = {
      ...base(),
      moduleOrientation: 'VERTICAL',
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.orientation).toBe('along_width');
  });

  it('11: orientação acompanha o comprimento (horizontal no fluxo)', () => {
    const a = {
      ...base(),
      moduleOrientation: 'HORIZONTAL',
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.orientation).toBe('along_length');
  });
});
