import { buildProjectAnswersV2 } from './answerMapping';
import {
  buildLayoutSolutionV2,
  fillWarehouseCross,
  MELHOR_LAYOUT_MAX_CANDIDATES,
} from './layoutSolutionV2';
import { MODULE_PALLET_BAYS_PER_LEVEL, moduleLengthAlongBeamMm } from './rackModuleSpec';
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

  it('MELHOR_LAYOUT: compara candidatos (orientação × profundidade × túnel) e maximiza posições', () => {
    const s = buildLayoutSolutionV2(base());
    expect(s.totals.positions).toBeGreaterThan(0);
    expect(typeof s.metadata.hasTunnel).toBe('boolean');
  });

  it('MELHOR_LAYOUT: até 48 variantes quando túnel é geometricamente possível (níveis ≥ 2)', () => {
    expect(MELHOR_LAYOUT_MAX_CANDIDATES).toBe(48);
    const s = buildLayoutSolutionV2({ ...base(), levels: 4 });
    expect(s.totals.positions).toBeGreaterThan(0);
  });

  it('MELHOR_LAYOUT com 1 nível não inclui túnel (incompatível com validação de geometria)', () => {
    const s = buildLayoutSolutionV2({ ...base(), levels: 1 });
    expect(s.metadata.hasTunnel).toBe(false);
  });

  it('faixa transversal remanescente vira corredor no modelo (uma fileira + espaço útil)', () => {
    const r = fillWarehouseCross({
      orientation: 'along_length',
      lengthMm: 40_000,
      widthMm: 8000,
      beamSpan: 40_000,
      crossSpan: 8000,
      bandDepth: 2700,
      corridorMm: 3000,
      depthMode: 'single',
      hasTunnel: false,
      tunnelPosition: undefined,
    });
    expect(r.rowBands).toHaveLength(1);
    const trailing = r.corridors.find(c => c.id.endsWith('cor-trailing'));
    expect(trailing).toBeDefined();
    expect(trailing!.label).toContain('faixa transversal');
    const w =
      Math.abs(trailing!.y1 - trailing!.y0) < Math.abs(trailing!.x1 - trailing!.x0)
        ? Math.abs(trailing!.y1 - trailing!.y0)
        : Math.abs(trailing!.x1 - trailing!.x0);
    expect(w).toBeGreaterThanOrEqual(3000 - 1);
  });

  it('faixa transversal estreita fica explícita no modelo (largura < corredor declarado)', () => {
    const r = fillWarehouseCross({
      orientation: 'along_length',
      lengthMm: 40_000,
      widthMm: 5699,
      beamSpan: 40_000,
      crossSpan: 5699,
      bandDepth: 2700,
      corridorMm: 3000,
      depthMode: 'single',
      hasTunnel: false,
      tunnelPosition: undefined,
    });
    expect(r.rowBands).toHaveLength(1);
    const trailing = r.corridors.find(c => c.id.endsWith('cor-trailing'));
    expect(trailing?.label).toContain('inferior ao corredor declarado');
  });

  it('posições = módulos (equiv.) × 2 baias × costas × patamares (sem túnel nem meio módulo)', () => {
    const a = {
      ...base(),
      lineStrategy: 'APENAS_SIMPLES' as const,
      hasTunnel: false,
    };
    const s = buildLayoutSolutionV2(a);
    const hasGround = a.hasGroundLevel !== false;
    const tiers = a.levels + (hasGround ? 1 : 0);
    const depth = s.rackDepthMode === 'double' ? 2 : 1;
    expect(s.totals.positions).toBe(
      Math.round(
        s.totals.modules *
          MODULE_PALLET_BAYS_PER_LEVEL *
          depth *
          tiers
      )
    );
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

  it('3b: sem túnel — passagem transversal vazia (largura tipo corredor) na mesma lógica de posição do túnel', () => {
    const a = {
      ...base(),
      lengthMm: 30_000,
      widthMm: 30_000,
      corridorMm: 3000,
      moduleDepthMm: 2700,
      moduleWidthMm: 1100,
      tunnelPosition: 'MEIO' as const,
      /** Estratégia fixa: MELHOR_LAYOUT pode preferir túnel se maximizar posições. */
      lineStrategy: 'APENAS_SIMPLES' as const,
      hasTunnel: false,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.metadata.hasTunnel).toBe(false);
    expect(s.rows.length).toBeGreaterThanOrEqual(2);
    expect(s.corridors.some(c => c.label === 'Passagem transversal')).toBe(
      true
    );

    const maxGapAlongBeam = (): number => {
      const row = s.rows[0]!;
      const intervals = row.modules
        .map(m => {
          if (s.orientation === 'along_length') {
            return [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)] as const;
          }
          return [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)] as const;
        })
        .sort((u, v) => u[0] - v[0]);
      let g = 0;
      for (let i = 1; i < intervals.length; i++) {
        g = Math.max(g, intervals[i]![0] - intervals[i - 1]![1]);
      }
      return g;
    };
    expect(maxGapAlongBeam()).toBeGreaterThan(500);
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
    expect(s.rows.some(r => r.modules.some(m => m.variant === 'tunnel'))).toBe(
      true
    );
    expect(s.rows.some(r => r.modules.length > 0)).toBe(true);
  });

  it('5: túnel no centro', () => {
    const a = {
      ...base(),
      /** Quadrado: `pickBetterOrientation` mantém along_length (vão paralelo ao eixo X nos asserts). */
      lengthMm: 20_000,
      widthMm: 20_000,
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
    expect(s.rows.some(r => r.modules.some(m => m.variant === 'tunnel'))).toBe(
      true
    );
  });

  it('7: meio módulo aceito (com túnel adjacente / extremos)', () => {
    const a = {
      ...base(),
      /** Comprimento onde um segmento após o túnel ainda permite meio módulo (depende do passo real). */
      lengthMm: 72_000,
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
      /** Remanescente entre meio e um módulo completo com passo real ~2575 mm (vão 1100). */
      lengthMm: 12_300,
      /** Transversal estreita: só 1 fileira (prof. 2700 mm + corredores não cabem 2 fileiras em 4000 mm). */
      widthMm: 4000,
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
      lengthMm: 20_000,
      widthMm: 20_000,
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
    const maxLeft = Math.max(
      ...m.filter(mod => mod.x1 <= beam.x0 + 1).map(mod => mod.x1),
      -1
    );
    const minRight = Math.min(
      ...m.filter(mod => mod.x0 >= beam.x1 - 1).map(mod => mod.x0),
      Infinity
    );
    expect(maxLeft).toBeGreaterThan(0);
    expect(minRight).toBeLessThan(Infinity);
    expect(minRight - maxLeft).toBeGreaterThan(0);
  });

  it('10: galpão quadrado favorece along_length (empate no optimizador)', () => {
    const s = buildLayoutSolutionV2({
      ...base(),
      lengthMm: 20_000,
      widthMm: 20_000,
      lineStrategy: 'APENAS_SIMPLES',
    });
    expect(s.orientation).toBe('along_length');
  });

  it('11: galpão estreito e longo — escolhe orientação com maior número de posições', () => {
    const s = buildLayoutSolutionV2({
      ...base(),
      lengthMm: 6_000,
      widthMm: 50_000,
      lineStrategy: 'APENAS_SIMPLES' as const,
    });
    expect(s.orientation).toBe('along_width');
  });

  it('12: moduleWidthMm = vão por baia; moduleDepthMm = profundidade (sem trocar campos por max/min)', () => {
    const session: Record<string, unknown> = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      levels: 4,
      capacityKg: 1200,
      moduleDepthMm: 1100,
      moduleWidthMm: 2700,
      lineStrategy: 'APENAS_SIMPLES',
      hasTunnel: false,
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 8000,
    };
    const v2 = buildProjectAnswersV2(session);
    expect(v2).not.toBeNull();
    const s = buildLayoutSolutionV2(v2!);
    expect(s.beamAlongModuleMm).toBe(2700);
    expect(s.moduleLengthAlongBeamMm).toBe(moduleLengthAlongBeamMm(2700));
    expect(s.rackDepthMm).toBe(1100);
  });

  it('13: vão (1100) e profundidade (2700) — pegada ao longo do vão usa passo do módulo, transversal usa profundidade', () => {
    const a = {
      ...base(),
      lengthMm: 20_000,
      widthMm: 20_000,
      moduleWidthMm: 1100,
      moduleDepthMm: 2700,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const s = buildLayoutSolutionV2(a);
    expect(s.orientation).toBe('along_length');
    expect(s.beamAlongModuleMm).toBe(1100);
    expect(s.moduleLengthAlongBeamMm).toBe(moduleLengthAlongBeamMm(1100));
    expect(s.rackDepthMm).toBe(2700);
    const full = s.rows[0]?.modules.find(
      m => m.type === 'full' && m.variant !== 'tunnel'
    );
    expect(full).toBeDefined();
    if (!full) return;
    const dx = Math.abs(full.x1 - full.x0);
    const dy = Math.abs(full.y1 - full.y0);
    const modLen = moduleLengthAlongBeamMm(1100);
    expect(dx).toBe(modLen);
    expect(dy).toBe(2700);
    expect(Math.max(dx, dy)).toBe(2700);
    expect(Math.min(dx, dy)).toBe(modLen);
  });

  it('14: tunnelAppliesTo UMA — só a primeira fileira tem módulo túnel; AMBOS aplica a todas', () => {
    const common = {
      ...base(),
      lengthMm: 20_000,
      widthMm: 20_000,
      hasTunnel: true,
      tunnelPosition: 'MEIO' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const sAmbos = buildLayoutSolutionV2({
      ...common,
      tunnelAppliesTo: 'AMBOS',
    });
    const sUma = buildLayoutSolutionV2({
      ...common,
      tunnelAppliesTo: 'UMA',
    });

    expect(sUma.rows.length).toBeGreaterThanOrEqual(2);
    expect(sAmbos.rows.length).toBe(sUma.rows.length);

    const rowHasTunnel = (r: (typeof sUma.rows)[number]) =>
      r.modules.some(m => m.variant === 'tunnel');

    expect(rowHasTunnel(sUma.rows[0]!)).toBe(true);
    expect(rowHasTunnel(sUma.rows[1]!)).toBe(false);
    expect(rowHasTunnel(sAmbos.rows[0]!)).toBe(true);
    expect(rowHasTunnel(sAmbos.rows[1]!)).toBe(true);

    const tunnelCount = (s: typeof sUma) =>
      s.rows.reduce(
        (n, r) => n + r.modules.filter(m => m.variant === 'tunnel').length,
        0
      );
    expect(tunnelCount(sUma)).toBe(1);
    expect(tunnelCount(sAmbos)).toBe(sAmbos.rows.length);
  });

  it('15: posição do túnel (INICIO/MEIO/FIM) só recorta ao longo do vão — mesma quantidade de fileiras', () => {
    const common = {
      ...base(),
      lengthMm: 40_000,
      widthMm: 16_000,
      hasTunnel: true,
      tunnelAppliesTo: 'AMBOS' as const,
      lineStrategy: 'APENAS_SIMPLES' as const,
    };
    const a = buildLayoutSolutionV2({
      ...common,
      tunnelPosition: 'INICIO',
    });
    const b = buildLayoutSolutionV2({
      ...common,
      tunnelPosition: 'MEIO',
    });
    const c = buildLayoutSolutionV2({
      ...common,
      tunnelPosition: 'FIM',
    });
    expect(a.rows.length).toBe(b.rows.length);
    expect(b.rows.length).toBe(c.rows.length);
    expect(a.orientation).toBe(b.orientation);
    expect(b.orientation).toBe(c.orientation);
  });
});
