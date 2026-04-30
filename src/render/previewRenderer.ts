/**
 * PDF de pré-visualização antes da marcação manual de índices de túnel.
 * Usa o mesmo motor {@link generatePdfV2FromSession} com sessão já preparada
 * (tipicamente sem túnel e sem índices manuais — ver fluxo em `tunnelPreview`).
 */

import type { Session } from '../domain/session';
import type { GenerateProjectPdfResult } from '../infra/pdf/pdfService';
import {
  generatePdfV2FromSession,
  type GeneratePdfV2FromSessionOptions,
} from '../infra/pdf/pdfV2Service';

export async function renderTunnelPreviewPdfFromSession(
  session: Session,
  options: GeneratePdfV2FromSessionOptions
): Promise<GenerateProjectPdfResult> {
  return generatePdfV2FromSession(session, options);
}
