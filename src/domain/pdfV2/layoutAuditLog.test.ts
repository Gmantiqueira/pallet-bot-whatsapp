import { buildProjectAnswersV2 } from './answerMapping';
import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { formatLayoutAuditReport, isLayoutAuditEnabled } from './layoutAuditLog';

describe('layoutAuditLog', () => {
  it('isLayoutAuditEnabled segue LAYOUT_AUDIT_LOG', () => {
    const prev = process.env.LAYOUT_AUDIT_LOG;
    delete process.env.LAYOUT_AUDIT_LOG;
    expect(isLayoutAuditEnabled()).toBe(false);
    process.env.LAYOUT_AUDIT_LOG = '1';
    expect(isLayoutAuditEnabled()).toBe(true);
    if (prev === undefined) delete process.env.LAYOUT_AUDIT_LOG;
    else process.env.LAYOUT_AUDIT_LOG = prev;
  });

  it('formatLayoutAuditReport inclui eixos, totais e túnel', () => {
    const session: Record<string, unknown> = {
      lengthMm: 12_000,
      widthMm: 10_000,
      corridorMm: 3000,
      levels: 4,
      capacityKg: 2000,
      moduleDepthMm: 2700,
      moduleWidthMm: 1100,
      lineStrategy: 'APENAS_SIMPLES',
      hasTunnel: true,
      tunnelPosition: 'MEIO',
      tunnelAppliesTo: 'AMBOS',
      halfModuleOptimization: false,
      firstLevelOnGround: true,
      heightMode: 'DIRECT',
      heightMm: 8000,
    };
    const v2 = buildProjectAnswersV2(session);
    expect(v2).not.toBeNull();
    const sol = buildLayoutSolutionV2(v2!);
    const text = formatLayoutAuditReport(v2!, sol, {
      caseId: 'test',
      label: 'audit',
    });
    expect(text).toContain('beamAlongModuleMm');
    expect(text).toContain('tunnelPosition');
    expect(text).toContain('MEIO');
    expect(text).toContain('positions');
    expect(text).toContain('rackModuleSpec.ts');
  });
});
