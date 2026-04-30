/**
 * Controlo de elementos só para desenvolvimento (legendas, guias, tints no 3D, overlays).
 * O PDF para cliente deve usar sempre omissão / `{ debug: false }`.
 */
export type PdfRenderOptions = {
  debug?: boolean;
};

/** Artefactos gráficos de diagnóstico só quando explicitamente ligados (testes / `PDF_RENDER_DEBUG`). */
export function pdfRenderDebugEnabled(
  renderOptions?: PdfRenderOptions | null
): boolean {
  return renderOptions?.debug === true;
}
