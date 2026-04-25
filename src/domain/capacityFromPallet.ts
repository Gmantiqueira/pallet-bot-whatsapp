/**
 * Carga de trabalho (kg por nível de feixe) a partir do peso de um palete,
 * regra: capacidade = 2× peso (duas baias por patamar na face de picking).
 * O orçamento e os relatórios usam só o valor `capacityKg` resultante.
 */
export function capacityKgFromPalletWeightKg(palletWeightKg: number): number {
  return 2 * palletWeightKg;
}
