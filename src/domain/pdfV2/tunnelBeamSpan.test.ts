import {
  legacyTunnelPositionToSpan,
  resolveTunnelSpanAlongBeam,
} from './tunnelBeamSpan';

describe('tunnelBeamSpan', () => {
  it('resolveTunnelSpanAlongBeam: offset explícito limita início do vão ao intervalo válido', () => {
    const { t0, t1 } = resolveTunnelSpanAlongBeam(40_000, 3000, {
      tunnelOffsetMm: 12_000,
    });
    expect(t0).toBe(12_000);
    expect(t1 - t0).toBeGreaterThan(800);
    expect(t1).toBeLessThanOrEqual(40_000);
  });

  it('offset muito grande equivale a posição FIM (clamp ao fim do vão)', () => {
    const beam = 20_000;
    const corridor = 3000;
    const atEnd = resolveTunnelSpanAlongBeam(beam, corridor, {
      tunnelPosition: 'FIM',
    });
    const clamped = resolveTunnelSpanAlongBeam(beam, corridor, {
      tunnelOffsetMm: 9e9,
    });
    expect(clamped.t0).toBeCloseTo(atEnd.t0, 3);
    expect(clamped.t1).toBeCloseTo(atEnd.t1, 3);
  });

  it('compat: INICIO / MEIO / FIM alinham-se a legacyTunnelPositionToSpan', () => {
    const beam = 30_000;
    const c = 3500;
    for (const pos of ['INICIO', 'MEIO', 'FIM'] as const) {
      const a = legacyTunnelPositionToSpan(beam, Math.max(800, c), pos);
      const b = resolveTunnelSpanAlongBeam(beam, c, { tunnelPosition: pos });
      expect(b.t0).toBeCloseTo(a.t0, 3);
      expect(b.t1).toBeCloseTo(a.t1, 3);
    }
  });
});
