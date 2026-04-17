import { buildProjectAnswersV2 } from './answerMapping';
import { buildLayoutSolutionV2 } from './layoutSolutionV2';
import { buildLayoutGeometry } from './layoutGeometryV2';
import { buildFloorPlanAccessories } from './visualAccessoriesV2';
import { selectStructure } from '../structureEngine';
import { resolveUprightHeightMmForProject } from '../projectEngines';
import {
  buildBillOfMaterials,
  countUprightsByThicknessFromGeometry,
  formatMm3d,
} from './billOfMaterials';
import type { ProjectAnswersV2 } from './answerMapping';

const base = (): ProjectAnswersV2 => ({
  lengthMm: 40_000,
  widthMm: 16_000,
  corridorMm: 3000,
  moduleDepthMm: 2700,
  moduleWidthMm: 1100,
  levels: 4,
  capacityKg: 2000,
  lineStrategy: 'APENAS_SIMPLES',
  hasTunnel: false,
  halfModuleOptimization: false,
  firstLevelOnGround: true,
  heightMode: 'DIRECT',
  heightMm: 8000,
});

describe('buildBillOfMaterials', () => {
  it('produz quantidades não negativas e totais coerentes com layoutSolution', () => {
    const a = {
      ...base(),
      columnProtector: false,
      guardRailSimple: false,
      guardRailDouble: false,
    };
    const v2 = buildProjectAnswersV2(a);
    expect(v2).not.toBeNull();
    const sol = buildLayoutSolutionV2(v2!);
    const geo = buildLayoutGeometry(sol, a);
    const acc = buildFloorPlanAccessories(a, geo);
    const structure = selectStructure({
      capacityKgPerLevel: a.capacityKg,
      levels: sol.metadata.structuralLevels,
      hasGroundLevel: sol.metadata.hasGroundLevel,
    });
    const h = resolveUprightHeightMmForProject(a);
    const bom = buildBillOfMaterials(sol, geo, acc, structure, h);

    expect(bom.totals.modulesAlong).toBe(sol.totals.modules);
    expect(bom.totals.positions).toBe(sol.totals.positions);
    for (const line of bom.lines) {
      expect(line.quantity).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(line.quantity)).toBe(true);
    }
    const counts = countUprightsByThicknessFromGeometry(geo);
    expect(counts.upright75 + counts.upright100).toBeGreaterThan(0);

    const depthFmt = formatMm3d(sol.rackDepthMm);
    const bayFmt = formatMm3d(sol.beamAlongModuleMm);
    const spanFmt = formatMm3d(sol.beamSpanMm);
    const hFmt = formatMm3d(h);
    const u75 = bom.lines.find(l => l.id === 'upright75');
    const u100 = bom.lines.find(l => l.id === 'upright100');
    const beams = bom.lines.find(l => l.id === 'beamPairs');
    expect(u75?.description).toContain(`${depthFmt}x${hFmt}`);
    expect(u100?.description).toContain(`${depthFmt}x${hFmt}`);
    expect(beams?.description).toContain(`Z95x${bayFmt}`);
    expect(beams?.description).not.toContain(spanFmt);
    expect(u75?.description).not.toContain(spanFmt);
    expect(bom.meta.rackDepthMm).toBe(sol.rackDepthMm);
    expect(bom.meta.beamBaySpanMm).toBe(sol.beamAlongModuleMm);
  });
});
