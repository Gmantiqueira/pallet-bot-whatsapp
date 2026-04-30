/**
 * Valores de documentação técnica no PDF (cotas / capacidades) quando o projeto
 * não traz dado explícito — ajustáveis por constante ou variável de ambiente.
 */

const envNum = (key: string): number | undefined => {
  const v = process.env[key];
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Capacidade nominal por palete (kg) quando `capacityKg` não está definida no projeto. */
export const DEFAULT_PALLET_CAPACITY_KG =
  envNum('PDF_DEFAULT_PALLET_CAPACITY_KG') ?? 1200;

/**
 * Folga de segurança (mm) somada à altura de elevação do último eixo de armazenagem
 * para estimar altura operacional de empilhadeira quando não há dado de equipamento.
 */
export const PDF_OPERATIONAL_SAFETY_CLEARANCE_MM =
  envNum('PDF_OPERATIONAL_SAFETY_CLEARANCE_MM') ?? 200;

export function formatKgCapacityPtBr(kg: number): string {
  return Math.round(Math.max(0, kg)).toLocaleString('pt-BR');
}

/** Altura mínima de texto corrido no papel (mm) — legível sem zoom em A4 típico. */
export const PDF_MIN_BODY_TEXT_MM = 2.5;

const PT_PER_MM = 72 / 25.4;

/** Equivalente em pontos PDF (~7,09 pt para 2,5 mm). */
export function pdfMinBodyTextPt(): number {
  return PDF_MIN_BODY_TEXT_MM * PT_PER_MM;
}

/**
 * Altura útil conservadora (pt) ao embutir a planta em A4 retrato após cabeçalho da folha.
 * Valores mais baixos no denominador aumentam o floor em px no SVG (texto nunca abaixo de ~{@link PDF_MIN_BODY_TEXT_MM} mm).
 */
export const FLOOR_PLAN_CONSERVATIVE_EMBED_HEIGHT_PT = 630;

/**
 * Tamanho mínimo de `font-size` no SVG da planta (unidades do viewBox) para que, após
 * rasterização e encaixe na caixa do PDF, o texto não fique abaixo de ~{@link PDF_MIN_BODY_TEXT_MM} mm.
 */
export function floorPlanMinSvgFontPx(viewBoxHeightPx: number): number {
  const minPt = pdfMinBodyTextPt();
  return Math.max(
    8,
    Math.ceil((minPt * viewBoxHeightPx) / FLOOR_PLAN_CONSERVATIVE_EMBED_HEIGHT_PT)
  );
}
