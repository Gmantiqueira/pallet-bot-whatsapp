/**
 * Validação final antes de rasterizar/compor o PDF V2: cruza respostas da sessão,
 * solução de layout, geometria canónica e coerência do resumo técnico.
 *
 * **Pré-requisitos:** {@link validateLayoutGeometry} e {@link validatePdfRenderCoherence}
 * já executados com a mesma instância de {@link LayoutGeometry}.
 *
 * Cobre:
 * - Galpão e corredor nas respostas = modelo implantado (evita PDF com cotas erradas).
 * - Solução de layout = snapshot em `geometry` (deteta mutação acidental).
 * - Altura de montante nas respostas = `heightMm` de cada módulo na geometria (planta/3D/elevação).
 * - Origem do projeto (planta vs medidas) sem campos contraditórios.
 * - Definição de altura completa (sem depender do fallback interno `níveis × 1500`).
 *
 * Regras operacionais (dupla costas, corredor bilateral) permanecem em {@link validateLayoutGeometry}.
 */

import {
  resolveUprightHeightMmForProject,
  uprightHeightMmFromAnswers,
} from '../projectEngines';
import {
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
} from '../warehouseHeightDerive';
import type { ProjectAnswersV2 } from './answerMapping';
import type { LayoutGeometry } from './layoutGeometryV2';
import type { LayoutSolutionV2 } from './types';

const MM_TOL = 0.75;
const HEIGHT_TOL_MM = 1;

export class PdfV2FinalConsistencyError extends Error {
  constructor(public readonly details: readonly string[]) {
    super(
      details.length === 1
        ? `PDF bloqueado (consistência final): ${details[0]}`
        : `PDF bloqueado (${details.length} itens): ${details.join(' | ')}`
    );
    this.name = 'PdfV2FinalConsistencyError';
  }
}

function nearEq(a: number, b: number, tol = MM_TOL): boolean {
  return Math.abs(a - b) <= tol;
}

function validateProjectOrigin(answers: Record<string, unknown>, errors: string[]): void {
  const pt = answers.projectType;
  const dfp = answers.dimensionsFromPlant;
  if (pt === 'PLANTA_REAL' && dfp === false) {
    errors.push(
      'Origem do projeto: projectType=PLANTA_REAL é incompatível com dimensionsFromPlant=false.'
    );
  }
  if (pt === 'MEDIDAS_DIGITADAS' && dfp === true) {
    errors.push(
      'Origem do projeto: projectType=MEDIDAS_DIGITADAS é incompatível com dimensionsFromPlant=true.'
    );
  }
}

/**
 * Após {@link finalizeSummaryAnswers}, o fluxo CALC pode ficar como `heightMode: DIRECT`
 * com `loadHeightMm` + `levels` e sem `heightMm` — ainda é uma definição explícita.
 */
function hasExplicitHeightSemantics(answers: Record<string, unknown>): boolean {
  if (uprightHeightMmFromAnswers(answers) !== null) return true;
  if (typeof answers.heightMm === 'number') return true;
  if (answers.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT) {
    return typeof answers.warehouseHeightMm === 'number';
  }
  if (answers.heightMode === 'CALC') {
    return (
      typeof answers.loadHeightMm === 'number' && typeof answers.levels === 'number'
    );
  }
  if (answers.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR) {
    return typeof answers.warehouseClearHeightMm === 'number';
  }
  if (
    answers.heightMode === 'DIRECT' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return true;
  }
  return false;
}

function validateHeightDefinitionCompleteness(
  answers: Record<string, unknown>,
  errors: string[]
): void {
  if (answers.heightMode === HEIGHT_MODE_WAREHOUSE_HEIGHT) {
    if (typeof answers.warehouseHeightMm !== 'number') {
      errors.push(
        'Definição de altura: heightMode=WAREHOUSE_HEIGHT exige warehouseHeightMm (número).'
      );
    }
    return;
  }
  if (answers.heightMode === 'CALC') {
    if (typeof answers.loadHeightMm !== 'number' || typeof answers.levels !== 'number') {
      errors.push(
        'Definição de altura: modo CALC exige loadHeightMm e levels (números).'
      );
    }
    return;
  }
  if (answers.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR) {
    if (typeof answers.warehouseClearHeightMm !== 'number') {
      errors.push(
        'Definição de altura: pé-direito útil exige warehouseClearHeightMm (número).'
      );
    }
    return;
  }
  if (
    answers.heightMode === 'DIRECT' &&
    typeof answers.loadHeightMm === 'number' &&
    typeof answers.levels === 'number'
  ) {
    return;
  }
  if (typeof answers.heightMm !== 'number') {
    errors.push(
      'Definição de altura: modo direto exige heightMm (número) ou par loadHeightMm+levels (fluxo CALC).'
    );
  }
}

function validateExplicitUprightSource(
  answers: Record<string, unknown>,
  errors: string[]
): void {
  if (!hasExplicitHeightSemantics(answers)) {
    errors.push(
      'Altura de montante: respostas não definem altura de forma explícita (evitar fallback interno níveis×1500).'
    );
  }
}

function validateSessionVsWarehouseAndCorridor(
  answers: Record<string, unknown>,
  v2: ProjectAnswersV2,
  geo: LayoutGeometry,
  errors: string[]
): void {
  if (!nearEq(v2.lengthMm, geo.warehouseLengthMm)) {
    errors.push(
      `Galpão: lengthMm (${v2.lengthMm}) ≠ warehouseLengthMm da geometria (${geo.warehouseLengthMm}).`
    );
  }
  if (!nearEq(v2.widthMm, geo.warehouseWidthMm)) {
    errors.push(
      `Galpão: widthMm (${v2.widthMm}) ≠ warehouseWidthMm da geometria (${geo.warehouseWidthMm}).`
    );
  }
  if (!nearEq(v2.corridorMm, geo.metadata.corridorMm)) {
    errors.push(
      `Corredor: corridorMm (${v2.corridorMm}) ≠ metadata.corridorMm (${geo.metadata.corridorMm}).`
    );
  }
  if (typeof answers.lengthMm === 'number' && !nearEq(answers.lengthMm, geo.warehouseLengthMm)) {
    errors.push(
      `Galpão: answers.lengthMm (${answers.lengthMm}) ≠ geometria implantada (${geo.warehouseLengthMm}).`
    );
  }
  if (typeof answers.widthMm === 'number' && !nearEq(answers.widthMm, geo.warehouseWidthMm)) {
    errors.push(
      `Galpão: answers.widthMm (${answers.widthMm}) ≠ geometria implantada (${geo.warehouseWidthMm}).`
    );
  }
  if (typeof answers.corridorMm === 'number' && !nearEq(answers.corridorMm, geo.metadata.corridorMm)) {
    errors.push(
      `Corredor: answers.corridorMm (${answers.corridorMm}) ≠ geometria (${geo.metadata.corridorMm}).`
    );
  }
}

function validateSolutionSnapshot(
  sol: LayoutSolutionV2,
  geo: LayoutGeometry,
  errors: string[]
): void {
  if (!nearEq(sol.warehouse.lengthMm, geo.warehouseLengthMm)) {
    errors.push(
      `layoutSolution.warehouse.lengthMm (${sol.warehouse.lengthMm}) ≠ geometry.warehouseLengthMm (${geo.warehouseLengthMm}).`
    );
  }
  if (!nearEq(sol.warehouse.widthMm, geo.warehouseWidthMm)) {
    errors.push(
      `layoutSolution.warehouse.widthMm (${sol.warehouse.widthMm}) ≠ geometry.warehouseWidthMm (${geo.warehouseWidthMm}).`
    );
  }
  if (!nearEq(sol.corridorMm, geo.metadata.corridorMm)) {
    errors.push(
      `layoutSolution.corridorMm (${sol.corridorMm}) ≠ geometry.metadata.corridorMm (${geo.metadata.corridorMm}).`
    );
  }
  if (Math.abs(sol.totals.equivalentAlongBeamSpan - geo.totals.moduleCount) > MM_TOL) {
    errors.push(
      `layoutSolution.totals.equivalentAlongBeamSpan (${sol.totals.equivalentAlongBeamSpan}) ≠ geometry.totals.moduleCount (${geo.totals.moduleCount}).`
    );
  }
  if (
    Math.abs(
      sol.totals.physicalPickingModules - geo.totals.physicalPickingModuleCount
    ) > MM_TOL
  ) {
    errors.push(
      `layoutSolution.totals.physicalPickingModules (${sol.totals.physicalPickingModules}) ≠ geometry.totals.physicalPickingModuleCount (${geo.totals.physicalPickingModuleCount}).`
    );
  }
  if (sol.totals.positions !== geo.totals.positionCount) {
    errors.push(
      `layoutSolution.totals.positions (${sol.totals.positions}) ≠ geometry.totals.positionCount (${geo.totals.positionCount}).`
    );
  }
  if (sol.totals.levels !== geo.totals.levelCount) {
    errors.push(
      `layoutSolution.totals.levels (${sol.totals.levels}) ≠ geometry.totals.levelCount (${geo.totals.levelCount}).`
    );
  }
  if (sol.metadata.structuralLevels !== geo.metadata.structuralLevels) {
    errors.push(
      `layoutSolution.metadata.structuralLevels (${sol.metadata.structuralLevels}) ≠ geometry.metadata.structuralLevels (${geo.metadata.structuralLevels}).`
    );
  }
}

function validateModuleHeightsMatchAnswers(
  answers: Record<string, unknown>,
  geo: LayoutGeometry,
  errors: string[]
): void {
  const expected = resolveUprightHeightMmForProject(answers);
  for (const row of geo.rows) {
    for (const m of row.modules) {
      if (Math.abs(m.heightMm - expected) > HEIGHT_TOL_MM) {
        errors.push(
          `Módulo ${m.id}: heightMm (${m.heightMm}) ≠ altura resolvida do projeto (${expected}).`
        );
        return;
      }
    }
  }
}

function validateV2StructuralAlignment(
  v2: ProjectAnswersV2,
  geo: LayoutGeometry,
  errors: string[]
): void {
  if (v2.levels !== geo.metadata.structuralLevels) {
    errors.push(
      `Níveis estruturais: v2answers.levels (${v2.levels}) ≠ geometry.metadata.structuralLevels (${geo.metadata.structuralLevels}).`
    );
  }
  if (!nearEq(v2.moduleDepthMm, geo.metadata.moduleDepthMm)) {
    errors.push(
      `Profundidade de posição: v2answers.moduleDepthMm (${v2.moduleDepthMm}) ≠ geometry.metadata.moduleDepthMm (${geo.metadata.moduleDepthMm}).`
    );
  }
  if (!nearEq(v2.moduleWidthMm, geo.metadata.beamAlongModuleMm)) {
    errors.push(
      `Vão (longarina): v2answers.moduleWidthMm (${v2.moduleWidthMm}) ≠ geometry.metadata.beamAlongModuleMm (${geo.metadata.beamAlongModuleMm}).`
    );
  }
}

/**
 * Última barreira antes do PDF: sessão + solução + geometria + altura/origem.
 * Lança {@link PdfV2FinalConsistencyError} se falhar.
 */
export function validatePdfV2FinalConsistency(args: {
  answers: Record<string, unknown>;
  v2answers: ProjectAnswersV2;
  layoutSolution: LayoutSolutionV2;
  geometry: LayoutGeometry;
}): void {
  const errors: string[] = [];
  const { answers, v2answers, layoutSolution, geometry } = args;

  validateProjectOrigin(answers, errors);
  validateHeightDefinitionCompleteness(answers, errors);
  validateExplicitUprightSource(answers, errors);
  validateSessionVsWarehouseAndCorridor(answers, v2answers, geometry, errors);
  validateSolutionSnapshot(layoutSolution, geometry, errors);
  validateV2StructuralAlignment(v2answers, geometry, errors);
  validateModuleHeightsMatchAnswers(answers, geometry, errors);

  if (errors.length > 0) {
    const msg = errors.join(' | ');
    // eslint-disable-next-line no-console
    console.error(`[pdf-v2 final consistency] ${msg}`);
    throw new PdfV2FinalConsistencyError(errors);
  }
}
