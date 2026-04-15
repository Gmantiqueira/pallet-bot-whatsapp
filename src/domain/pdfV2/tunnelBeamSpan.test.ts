import {
  legacyTunnelPositionToSpan,
  operationalPackedExtentMm,
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

  it('compat: INICIO / MEIO / FIM alinham-se a legacyTunnelPositionToSpan (sem extensão operacional)', () => {
    const beam = 30_000;
    const c = 3500;
    const tw = Math.max(800, c);
    for (const pos of ['INICIO', 'MEIO', 'FIM'] as const) {
      const a = legacyTunnelPositionToSpan(beam, tw, pos);
      const b = resolveTunnelSpanAlongBeam(beam, c, { tunnelPosition: pos });
      expect(b.t0).toBeCloseTo(a.t0, 3);
      expect(b.t1).toBeCloseTo(a.t1, 3);
    }
  });

  it('MEIO com extensão operacional < vão: centro deslocado face ao centro do compartimento', () => {
    const beam = 40_000;
    const corridor = 3000;
    const tw = Math.max(800, corridor);
    const operational = 28_000;
    const full = legacyTunnelPositionToSpan(beam, tw, 'MEIO');
    const op = legacyTunnelPositionToSpan(beam, tw, 'MEIO', operational);
    const midFull = (full.t0 + full.t1) / 2;
    const midOp = (op.t0 + op.t1) / 2;
    expect(midFull).toBeCloseTo(beam / 2, 3);
    expect(midOp).toBeCloseTo(operational / 2, 3);
    expect(midOp).not.toBeCloseTo(midFull, 0);
  });

  it('FIM ancorado ao fim operacional: t1 ≈ extensão operacional', () => {
    const beam = 50_000;
    const tw = 3000;
    const operational = 36_500;
    const { t0, t1 } = legacyTunnelPositionToSpan(beam, tw, 'FIM', operational);
    expect(t1).toBeCloseTo(Math.min(beam, t0 + tw), 3);
    expect(t1).toBeLessThanOrEqual(beam);
    expect(t0).toBeCloseTo(operational - Math.min(tw, operational), 3);
  });

  it('resolveTunnelSpanAlongBeam repete legacy com operationalExtentMm no placement', () => {
    const beam = 40_000;
    const c = 3000;
    const tw = Math.max(800, c);
    const operational = 31_000;
    const leg = legacyTunnelPositionToSpan(beam, tw, 'MEIO', operational);
    const r = resolveTunnelSpanAlongBeam(beam, c, {
      tunnelPosition: 'MEIO',
      operationalExtentMm: operational,
    });
    expect(r.t0).toBeCloseTo(leg.t0, 3);
    expect(r.t1).toBeCloseTo(leg.t1, 3);
  });

  it('operationalPackedExtentMm: meio módulo aumenta extensão quando cabe', () => {
    const bay = 1100;
    const beam = 40_000;
    const withoutHalf = operationalPackedExtentMm(beam, bay, false, true);
    const withHalf = operationalPackedExtentMm(beam, bay, true, true);
    expect(withHalf).toBeGreaterThanOrEqual(withoutHalf);
    expect(withoutHalf).toBeGreaterThan(0);
  });
});
