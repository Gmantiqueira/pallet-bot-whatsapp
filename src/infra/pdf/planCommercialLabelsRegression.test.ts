import type { ProjectAnswersV2 } from '../../domain/pdfV2/answerMapping';
import { buildLayoutSolutionV2 } from '../../domain/pdfV2/layoutSolutionV2';
import {
  buildLayoutGeometry,
  validateLayoutGeometry,
  type LayoutGeometry,
} from '../../domain/pdfV2/layoutGeometryV2';
import {
  buildFloorPlanModelV2,
  moduleSpanCountsFromFloorPlanStructureRects,
} from '../../domain/pdfV2/floorPlanModelV2';
import { planModuleFaceLabel } from '../../domain/pdfV2/svgFloorPlanV2';
import { formatModuleSpanCountsCommercialPt } from '../../domain/pdfV2/formatModuleCountDisplay';
import { selectStructure } from '../../domain/structureEngine';
import { technicalSummaryRowsFromLayoutGeometry } from './pdfV2TechnicalSummary';

/**
 * Regressão: várias linhas duplas, meio-módulo no fim de várias faces,
 * túneis manuais e alinhamento resumo técnico ↔ planta.
 */
describe('planta + resumo técnico (regressão comercial)', () => {
  const baseAnswers = (): ProjectAnswersV2 => ({
    lengthMm: 38_000,
    widthMm: 28_000,
    corridorMm: 3000,
    moduleDepthMm: 2700,
    moduleWidthMm: 1100,
    levels: 4,
    capacityKg: 2000,
    lineStrategy: 'PERSONALIZADO',
    customLineSimpleCount: 0,
    customLineDoubleCount: 3,
    hasTunnel: false,
    halfModuleOptimization: true,
    firstLevelOnGround: true,
    heightMode: 'DIRECT',
    heightMm: 8000,
  });

  function geometryWithPlanCounts(
    geo: LayoutGeometry,
    project: Record<string, unknown>
  ): LayoutGeometry {
    const plan = buildFloorPlanModelV2(geo, project);
    const planModuleSpanCounts =
      moduleSpanCountsFromFloorPlanStructureRects(plan.structureRects);
    return {
      ...geo,
      totals: { ...geo.totals, planModuleSpanCounts },
    };
  }

  it('múltiplas duplas + meios + túneis manuais: rótulos e totais coerentes', () => {
    const a0 = baseAnswers();
    const ans0 = a0 as unknown as Record<string, unknown>;
    const sol0 = buildLayoutSolutionV2(a0);
    expect(sol0.rows.length).toBe(3);
    expect(sol0.rows.every(r => r.kind === 'double')).toBe(true);

    const geo0 = buildLayoutGeometry(sol0, ans0);
    validateLayoutGeometry(geo0);
    const plan0 = buildFloorPlanModelV2(geo0, ans0);

    const fullDisplaySorted = [
      ...new Set(
        plan0.structureRects
          .filter(
            r =>
              r.displayIndex != null &&
              r.segmentType !== 'half' &&
              r.variant !== 'tunnel'
          )
          .map(r => r.displayIndex!)
      ),
    ].sort((x, y) => x - y);
    expect(fullDisplaySorted.length).toBeGreaterThan(12);
    const ixLow = fullDisplaySorted[7]!;
    const ixHigh =
      fullDisplaySorted[Math.max(8, fullDisplaySorted.length - 6)]!;
    expect(ixLow).not.toBe(ixHigh);

    const a: ProjectAnswersV2 = {
      ...a0,
      hasTunnel: true,
      tunnelManualModuleIndices: [ixLow, ixHigh],
    };
    const ans = a as unknown as Record<string, unknown>;
    const sol = buildLayoutSolutionV2(a);
    const geo = buildLayoutGeometry(sol, ans);
    validateLayoutGeometry(geo);

    const plan = buildFloorPlanModelV2(geo, ans);
    const planCounts = moduleSpanCountsFromFloorPlanStructureRects(
      plan.structureRects
    );

    const displayInts: number[] = [];
    let labelHalf = 0;
    let labelTunnel = 0;

    for (const r of plan.structureRects) {
      const lbl = planModuleFaceLabel({
        displayIndex: r.displayIndex,
        segmentType: r.segmentType,
        variant: r.variant,
      });
      if (r.variant === 'tunnel') {
        expect(lbl).toBe('T');
        labelTunnel += 1;
        continue;
      }
      if (r.segmentType === 'half') {
        expect(lbl).toBe('1/2');
        labelHalf += 1;
        continue;
      }
      expect(r.displayIndex).toBeDefined();
      displayInts.push(r.displayIndex!);
    }

    expect(new Set(displayInts).size).toBe(displayInts.length);
    expect(Math.min(...displayInts)).toBe(1);
    const maxDisplayed = Math.max(...displayInts);

    expect(planCounts.fullModules).toBe(displayInts.length);
    expect(planCounts.fullModules).toBe(maxDisplayed);
    expect(planCounts.halfModules).toBe(labelHalf);
    expect(planCounts.tunnels).toBe(labelTunnel);
    expect(planCounts.halfModules).toBeGreaterThanOrEqual(6);
    expect(planCounts.tunnels).toBeGreaterThanOrEqual(2);

    const structure = selectStructure({
      capacityKgPerLevel: a.capacityKg,
      levels: a.levels,
      hasGroundLevel: a.firstLevelOnGround !== false,
    });
    const project = { ...ans, structure };
    const geoDoc = geometryWithPlanCounts(geo, project);
    const rows = technicalSummaryRowsFromLayoutGeometry(project, geoDoc);
    const modulosRow = rows.find(r => r.label === 'Módulos:');
    expect(modulosRow).toBeDefined();
    expect(modulosRow!.value).toBe(
      formatModuleSpanCountsCommercialPt(planCounts)
    );
  });
});
