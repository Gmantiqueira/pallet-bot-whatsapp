/**
 * Compatível com código existente que importava daqui —
 * contagens ao longo do vão vivam em {@link ../../../core/moduleCounter}.
 */

export type { ModuleSpanCounts } from './types';
export {
  emptyModuleSpanCounts,
  addModuleSpanCounts,
  equivalentAlongBeamSpan,
  aggregateModuleSpanCountsFromRows,
} from '../../core/moduleCounter';
