/**
 * Modelo de módulos / segmentos ao longo do vão — tipos em pdfV2, contagens puras em `core/moduleCounter`.
 */

export type {
  ModuleSegment,
  ModuleSpanCounts,
  ModuleVariantV2,
} from './pdfV2/types';
export type { RackModule } from './pdfV2/layoutGeometryV2';

export {
  aggregateModuleSpanCountsFromRows,
  addModuleSpanCounts,
  emptyModuleSpanCounts,
  equivalentAlongBeamSpan,
} from '../core/moduleCounter';
