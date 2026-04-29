/**
 * Geração do PDF técnico V2 (capa, planta, elevações, 3D).
 * Ponto de entrada de leitura para a app; a implementação mantém-se em `infra/pdf`.
 */

import type { Session } from '../domain/session';
import type { GenerateProjectPdfResult } from '../infra/pdf/pdfService';
import {
  generatePdfV2FromSession,
  measureElevationLandscapeDrawingMetrics,
  renderPdfV2,
  ELEV_PDF_HEADER_STANDARD_TITLE,
  ELEV_PDF_HEADER_STANDARD_SUBTITLE,
  ELEV_PDF_HEADER_TUNNEL_TITLE,
  ELEV_PDF_HEADER_TUNNEL_SUBTITLE,
  ELEVATION_LANDSCAPE_PAGE_SIZE,
  type GenerateProjectPdfV2Input,
  type ElevationLandscapeDrawingMeasure,
} from '../infra/pdf/pdfV2Service';

export type {
  GenerateProjectPdfResult,
  GenerateProjectPdfV2Input,
  ElevationLandscapeDrawingMeasure,
};

export {
  generatePdfV2FromSession,
  renderPdfV2,
  measureElevationLandscapeDrawingMetrics,
  ELEV_PDF_HEADER_STANDARD_TITLE,
  ELEV_PDF_HEADER_STANDARD_SUBTITLE,
  ELEV_PDF_HEADER_TUNNEL_TITLE,
  ELEV_PDF_HEADER_TUNNEL_SUBTITLE,
  ELEVATION_LANDSCAPE_PAGE_SIZE,
};

/**
 * Alias semântico — mesmo pipeline que {@link generatePdfV2FromSession}.
 */
export function renderProjectPdfFromSession(
  session: Session,
  options: { storagePath: string }
): Promise<GenerateProjectPdfResult> {
  return generatePdfV2FromSession(session, options);
}
