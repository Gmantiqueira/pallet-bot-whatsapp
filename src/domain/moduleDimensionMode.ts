/**
 * Modos de introdução de profundidade de posição (montante) e vão de baia (longarina).
 * O motor de layout continua a receber só `moduleDepthMm` e `beamLengthMm` — o PDF não muda
 * consoante a origem dos valores.
 */
export type ModuleDimensionMode = 'PALLET' | 'MANUAL';

const PALLET_TO_UPRIGHT_OFFSET_MM = 200;

/**
 * A partir de medidas de palete (mm): prof. montante = prof. palete − 200;
 * vão/entrada (longarina por baia) = 2× frente + 300.
 */
export function moduleGeometryFromPalletInputMm(
  palletDepthMm: number,
  palletFrontMm: number
): { moduleDepthMm: number; beamLengthMm: number } {
  return {
    moduleDepthMm: palletDepthMm - PALLET_TO_UPRIGHT_OFFSET_MM,
    beamLengthMm: palletFrontMm * 2 + 300,
  };
}

export { PALLET_TO_UPRIGHT_OFFSET_MM };
