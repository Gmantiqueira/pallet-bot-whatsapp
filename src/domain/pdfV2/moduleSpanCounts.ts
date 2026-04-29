/**
 * Contagens explícitas de segmentos ao longo do eixo das longarinas (por fileira → somadas).
 * Túnel é sempre contagem inteira própria; meio módulo aparece apenas em campo dedicado (nunca .5 agregado).
 */

import type { ModuleSegment, ModuleSpanCounts } from './types';

export type { ModuleSpanCounts } from './types';

export function emptyModuleSpanCounts(): ModuleSpanCounts {
  return { fullModules: 0, halfModules: 0, tunnels: 0 };
}

export function addModuleSpanCounts(
  a: ModuleSpanCounts,
  b: ModuleSpanCounts
): ModuleSpanCounts {
  return {
    fullModules: a.fullModules + b.fullModules,
    halfModules: a.halfModules + b.halfModules,
    tunnels: a.tunnels + b.tunnels,
  };
}

/**
 * Equivalente longitudinal ao longo do vão (meio = ½, túnel = 1 slot) —
 * para ordenação e igualdades com o modelo numérico legado; não usar como texto comercial direto.
 */
export function equivalentAlongBeamSpan(c: ModuleSpanCounts): number {
  return c.fullModules + 0.5 * c.halfModules + c.tunnels;
}

export function aggregateModuleSpanCountsFromRows(
  rows: ReadonlyArray<{ readonly modules: ReadonlyArray<ModuleSegment> }>
): ModuleSpanCounts {
  let fullModules = 0;
  let halfModules = 0;
  let tunnels = 0;
  for (const row of rows) {
    for (const m of row.modules) {
      if (m.variant === 'tunnel') {
        tunnels += 1;
        continue;
      }
      if (m.type === 'half') halfModules += 1;
      else fullModules += 1;
    }
  }
  return { fullModules, halfModules, tunnels };
}
