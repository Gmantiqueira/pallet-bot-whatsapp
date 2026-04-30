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
