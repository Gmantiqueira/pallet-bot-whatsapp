/**
 * Metadados do PDF após gravação em disco — contrato para integração interna.
 *
 * Este serviço apenas gera e persiste o ficheiro; o gateway/integrador WhatsApp
 * lê `absolutePath` (ou copia a partir do storage partilhado) e anexa ao cliente.
 * Não há URL pública implícita nem dependência de localhost.
 */
export type GeneratedPdfArtifact = {
  filename: string;
  /** Caminho absoluto do ficheiro no servidor após `generate*` concluir. */
  absolutePath: string;
  mimeType: 'application/pdf';
  sizeBytes: number;
  /**
   * Caminho relativo ao diretório de storage configurado (não é URL HTTP).
   * Útil para logs e debug; o integrador deve preferir `absolutePath` ou storage montado.
   */
  storageRelativePath: string;
};
