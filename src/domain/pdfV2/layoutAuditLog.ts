/**
 * Relatório legível de auditoria geométrica do motor de layout (dev/teste).
 * Não invocar em produção salvo flag explícita — usar {@link isLayoutAuditEnabled}.
 */

import type { ProjectAnswersV2 } from './answerMapping';
import {
  beamRunPitchPerModuleMm,
  maxFullModulesInBeamRun,
  moduleFootprintAlongBeamInRunMm,
  moduleLengthAlongBeamMm as moduleLengthAlongBeamMmFromBay,
  totalBeamRunLengthForModuleCount,
} from './rackModuleSpec';
import type { LayoutOrientationV2, LayoutSolutionV2, ModuleSegment } from './types';

const EPS = 1;

/** Ativa relatório quando `LAYOUT_AUDIT_LOG` é `1`, `true` ou `yes`. */
export function isLayoutAuditEnabled(): boolean {
  if (typeof process === 'undefined' || process.env == null) return false;
  const v = process.env.LAYOUT_AUDIT_LOG;
  return v === '1' || v === 'true' || v === 'yes';
}

function beamSpanLabel(o: LayoutOrientationV2): string {
  return o === 'along_length'
    ? 'comprimento do galpão (eixo X)'
    : 'largura do galpão (eixo Y)';
}

function crossSpanLabel(o: LayoutOrientationV2): string {
  return o === 'along_length'
    ? 'largura do galpão (eixo Y)'
    : 'comprimento do galpão (eixo X)';
}

function moduleAlongExtent(
  m: ModuleSegment,
  orientation: LayoutOrientationV2
): [number, number] {
  if (orientation === 'along_length') {
    return [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
  }
  return [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
}

function moduleCrossExtent(
  m: ModuleSegment,
  orientation: LayoutOrientationV2
): [number, number] {
  if (orientation === 'along_length') {
    return [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
  }
  return [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
}

function rowAlongRange(
  modules: ModuleSegment[],
  orientation: LayoutOrientationV2
): { min: number; max: number } {
  let minV = Infinity;
  let maxV = -Infinity;
  for (const m of modules) {
    const [a, b] = moduleAlongExtent(m, orientation);
    minV = Math.min(minV, a);
    maxV = Math.max(maxV, b);
  }
  return { min: minV === Infinity ? 0 : minV, max: maxV === -Infinity ? 0 : maxV };
}

/**
 * Corridas normais ao longo do vão (trechos entre módulos túnel), na ordem ao longo do vão.
 */
function normalRunsAlongBeam(
  modules: ModuleSegment[],
  orientation: LayoutOrientationV2
): ModuleSegment[][] {
  const sorted = [...modules].sort((u, v) => {
    const [ua] = moduleAlongExtent(u, orientation);
    const [va] = moduleAlongExtent(v, orientation);
    return ua - va;
  });
  const runs: ModuleSegment[][] = [];
  let cur: ModuleSegment[] = [];
  for (const m of sorted) {
    if (m.variant === 'tunnel') {
      if (cur.length) runs.push(cur);
      cur = [];
      continue;
    }
    if (m.type === 'half' || m.type === 'full') cur.push(m);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Soma de pegadas ao longo do vão para uma corrida (índices 0..n como no motor). */
function sumFootprintsAlongRun(run: ModuleSegment[], bay: number): number {
  let idx = 0;
  let sum = 0;
  for (const m of run) {
    if (m.type === 'full' && m.variant !== 'tunnel') {
      sum += moduleFootprintAlongBeamInRunMm(idx, bay);
      idx += 1;
    } else if (m.type === 'half') {
      sum += moduleLengthAlongBeamMmFromBay(bay) / 2;
    }
  }
  return sum;
}

function residualInRunMm(
  lenMm: number,
  bay: number,
  halfOpt: boolean,
  allowHalfEnd: boolean
): { remMm: number; rejectedHalf: boolean } {
  const firstLen = moduleLengthAlongBeamMmFromBay(bay);
  if (firstLen <= 0 || lenMm < EPS)
    return { remMm: lenMm, rejectedHalf: false };
  const nFull = maxFullModulesInBeamRun(lenMm, bay);
  const usedFull = totalBeamRunLengthForModuleCount(nFull, bay);
  let rem = lenMm - usedFull;
  const wantHalf =
    halfOpt && rem + EPS >= firstLen / 2 && rem < firstLen - EPS;
  if (!wantHalf) return { remMm: rem, rejectedHalf: false };
  if (allowHalfEnd) {
    rem -= firstLen / 2;
    return { remMm: Math.max(0, rem), rejectedHalf: false };
  }
  return { remMm: rem, rejectedHalf: true };
}

export type LayoutAuditMeta = {
  caseId?: string;
  label?: string;
};

/**
 * Texto multi-linha (PT) com decisões do layout: eixos, fórmulas, fileiras, túnel, sobras.
 */
export function formatLayoutAuditReport(
  answers: ProjectAnswersV2,
  sol: LayoutSolutionV2,
  meta?: LayoutAuditMeta
): string {
  const lines: string[] = [];
  const push = (...xs: string[]) => lines.push(...xs);

  const hdr = meta?.caseId
    ? `=== Layout audit · ${meta.caseId}${meta.label ? ` · ${meta.label}` : ''} ===`
    : '=== Layout audit ===';
  push(hdr);

  const o = sol.orientation;
  const beamSpan = sol.beamSpanMm;
  const crossSpan = sol.crossSpanMm;
  const bay = sol.beamAlongModuleMm;
  const { lengthMm, widthMm } = sol.warehouse;
  const rowBandCount = sol.rows.length;

  push('');
  push('— Entrada (galpão) —');
  push(`  lengthMm (X): ${lengthMm} mm`);
  push(`  widthMm (Y):  ${widthMm} mm`);
  push(`  corridorMm:   ${sol.corridorMm} mm`);

  push('');
  push('— Eixos vs inputs —');
  push(
    `  Orientação escolhida: ${o} (optimizador compara candidatos orientação × profundidade).`
  );
  push(
    `  Vão por baia (= beamLengthMm / moduleWidthMm na sessão → beamAlongModuleMm): ${bay} mm`
  );
  push(
    `    → aplica-se ao eixo do **vão** / longarinas: ${beamSpanLabel(o)} (nesta solução: beamSpanMm = ${beamSpan} mm).`
  );
  push(
    `  Profundidade de posição (moduleDepthMm): ${sol.moduleDepthMm} mm → profundidade de faixa rackDepthMm = ${sol.rackDepthMm} mm no eixo **transversal ao vão**: ${crossSpanLabel(o)}.`
  );
  push(`  crossSpanMm (extensão do galpão nesse eixo transversal): ${crossSpan} mm`);

  push('');
  push('— Módulo (derivados) —');
  push(
    `  Largura frontal ao longo do vão (1 módulo, 2 baias + estrutura): moduleLengthAlongBeamMm = ${sol.moduleLengthAlongBeamMm.toFixed(1)} mm`
  );
  push(
    `  Passo entre módulos consecutivos na mesma corrida: beamRunPitchPerModuleMm = ${beamRunPitchPerModuleMm(bay).toFixed(1)} mm`
  );

  push('');
  push('— Fórmula (módulos completos num trecho de comprimento L ao longo do vão) —');
  push(
    `  maxFullModulesInBeamRun(L, vão) = floor((L − 75) / pitch), pitch = beamRunPitchPerModuleMm(vão),`
  );
  push(
    `  com L ≥ comprimento do 1.º módulo (${moduleLengthAlongBeamMmFromBay(bay).toFixed(1)} mm).`
  );
  push(
    `  Ocupação de n módulos completos em série: totalBeamRunLengthForModuleCount(n, vão).`
  );
  push(
    `  Meio-módulo: ver halfModuleOptimization + extremo com circulação (túnel/corredor/múltiplas fileiras).`
  );
  push(`  (Implementação: src/domain/pdfV2/rackModuleSpec.ts + layoutSolutionV2.ts.)`);

  push('');
  push(`— Fileiras (${sol.rows.length}) —`);
  for (const row of sol.rows) {
    const mods = row.modules;
    const fullN = mods.filter(
      m => m.type === 'full' && m.variant !== 'tunnel'
    ).length;
    const halfN = mods.filter(m => m.type === 'half').length;
    const tunN = mods.filter(m => m.variant === 'tunnel').length;
    const { min: a0, max: a1 } = rowAlongRange(mods, o);
    const alongUsed = a1 - a0;
    const runs = normalRunsAlongBeam(mods, o);
    const runNotes: string[] = [];
    for (const run of runs) {
      const coords = run.map(m => moduleAlongExtent(m, o));
      const r0 = Math.min(...coords.map(c => c[0]));
      const r1 = Math.max(...coords.map(c => c[1]));
      const len = r1 - r0;
      /** Aproximação: meio-módulo no fim do troço só quando ≥2 fileiras (regra completa: canHaveHalfAtBeamEnd). */
      const allowHalfEnd = rowBandCount >= 2;
      const { remMm, rejectedHalf } = residualInRunMm(
        len,
        bay,
        answers.halfModuleOptimization,
        allowHalfEnd
      );
      const fp = sumFootprintsAlongRun(run, bay);
      runNotes.push(
        `corrida [${r0.toFixed(0)}–${r1.toFixed(0)}] L=${len.toFixed(0)} mm → pegadas ∑=${fp.toFixed(0)} mm, sobra teórica pós-regra ~${remMm.toFixed(0)} mm${rejectedHalf ? ' (meio rejeitado)' : ''}`
      );
    }
    push(
      `  ${row.id} (${row.kind}): full=${fullN}, half=${halfN}, tunnel=${tunN} | projeção ao longo do vão [${a0.toFixed(0)}, ${a1.toFixed(0)}] (Δ=${alongUsed.toFixed(0)} mm)`
    );
    for (const note of runNotes) push(`    ${note}`);
  }

  push('');
  push('— Consumo vs dimensão do galpão (nesta orientação) —');
  let cMin = Infinity;
  let cMax = -Infinity;
  for (const row of sol.rows) {
    for (const m of row.modules) {
      const [t0, t1] = moduleCrossExtent(m, o);
      cMin = Math.min(cMin, t0);
      cMax = Math.max(cMax, t1);
    }
  }
  if (cMin === Infinity) {
    push('  (sem módulos)');
  } else {
    const crossUsed = cMax - cMin;
    const crossRem = crossSpan - crossUsed;
    push(
      `  Eixo transversal (${crossSpanLabel(o)}): ocupado ~${crossUsed.toFixed(0)} mm de ${crossSpan} mm (sobra ~${crossRem.toFixed(0)} mm na faixa coberta pelos módulos).`
    );
  }
  push(
    `  Eixo do vão (${beamSpanLabel(o)}): beamSpanMm = ${beamSpan} mm.`
  );
  for (const row of sol.rows) {
    const { min, max } = rowAlongRange(row.modules, o);
    const gap = beamSpan - (max - min);
    if (gap > EPS) {
      push(
        `    ${row.id}: folga entre extremos dos módulos e beamSpan ≈ ${gap.toFixed(1)} mm.`
      );
    }
  }

  push('');
  push('— Capacidade (totals da solução) —');
  push(
    `  segmentCounts ${JSON.stringify(sol.totals.segmentCounts)} | equiv(span): ${sol.totals.equivalentAlongBeamSpan} | positions: ${sol.totals.positions} | levels: ${sol.totals.levels}`
  );
  if (sol.metadata.halfModuleRejectedReason) {
    push(`  halfModule: ${sol.metadata.halfModuleRejectedReason}`);
  }

  push('');
  push('— Túnel —');
  if (!sol.metadata.hasTunnel) {
    push('  (sem túnel neste projeto)');
  } else {
    push(`  tunnelOffsetMm (pedido): ${answers.tunnelOffsetMm ?? '—'}`);
    push(
      `  tunnelOffsetEffectiveMm: ${sol.metadata.tunnelOffsetEffectiveMm ?? '—'}`
    );
    push(`  tunnelPosition: ${answers.tunnelPosition ?? '—'}`);
    push(
      `  tunnelPlacements: ${
        Array.isArray(answers.tunnelPlacements) &&
        answers.tunnelPlacements.length > 0
          ? answers.tunnelPlacements.join(', ')
          : '—'
      }`
    );
    push(`  tunnelAppliesTo: ${answers.tunnelAppliesTo ?? '—'}`);
    for (const row of sol.rows) {
      const tunnels = row.modules.filter(m => m.variant === 'tunnel');
      if (tunnels.length === 0) {
        push(`  ${row.id}: (sem módulo túnel nesta fileira)`);
        continue;
      }
      const parts = tunnels.map(t => {
        const [x0, x1] = moduleAlongExtent(t, o);
        return `[${x0.toFixed(0)}–${x1.toFixed(0)}]`;
      });
      push(
        `  ${row.id}: ${tunnels.length} módulo(s) túnel ao longo do vão: ${parts.join(', ')}`
      );
    }
  }

  push('');
  push('=== fim relatório ===');
  return lines.join('\n');
}
