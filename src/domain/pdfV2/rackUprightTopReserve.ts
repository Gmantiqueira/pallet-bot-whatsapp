/**
 * Reserva estrutural (mm) entre o eixo da última longarina de armazenagem e o topo do montante.
 * Reduz custo de perfil com faixa estreita e âncora de desenho de cima para baixo.
 */

/** Valor alvo de referência (mm) — documentação e orçamento. */
export const RACK_TOP_CLEARANCE_IDEAL_MM = 300;

/** Limite inferior aceitável (mm) quando a altura do montante permite. */
export const RACK_TOP_CLEARANCE_MIN_MM = 250;

/** Nunca ultrapassar esta folga superior (mm) sem justificação técnica explícita. */
export const RACK_TOP_CLEARANCE_MAX_MM = 350;

/**
 * Mantido como alias do alvo atual para código legado;
 * igual a {@link RACK_TOP_CLEARANCE_IDEAL_MM} (substitui a antiga fixação em 216 mm).
 */
export const RACK_TOP_CLEARANCE_LAST_BEAM_TO_COLUMN_TOP_MM =
  RACK_TOP_CLEARANCE_IDEAL_MM;

/**
 * Sugere folga estrutural (mm) dado o espaço físico disponível para a banda `[MIN, IDEAL]` e teto MAX.
 * Prioridade: ficar próximo do ideal (~300 mm), dentro da banda quando `maxStructuralTopMm` permite.
 */
export function clampStructuralTopReserveMm(params: {
  /** Altura total do montante (mm). */
  uprightHeightMm: number;
  /** Folga estrutural inferior já resolvida (mm). */
  structuralBottomMm: number;
  /** Espaço mínimo útil vertical exigido (mm) — ver “minimos” no motor de níveis (`minUsableMm`). */
  minVerticalUsableMm: number;
  /** Override explícito (ex.: cenário especial), já limitado por UI se necessário. */
  structuralTopMmHint?: number;
}): number {
  const H0 = params.uprightHeightMm;
  const sb = params.structuralBottomMm;
  const maxTopReserve = Math.max(
    Number.EPSILON,
    H0 - sb - params.minVerticalUsableMm
  );

  const ideal =
    typeof params.structuralTopMmHint === 'number' &&
    params.structuralTopMmHint > Number.EPSILON
      ? Math.min(
          Math.max(params.structuralTopMmHint, Number.EPSILON),
          RACK_TOP_CLEARANCE_MAX_MM
        )
      : RACK_TOP_CLEARANCE_IDEAL_MM;

  /** Primeiro ficar no ideal até ao teto físico e ao máximo da banda. */
  let structuralTop = Math.min(ideal, maxTopReserve, RACK_TOP_CLEARANCE_MAX_MM);

  /**
   * Com altura suficiente, mantemos a tolerância 250–350 mm (nunca abrimos espaço irrelevante por baixo de 250
   * quando já caberia 250 ou mais em cima — evita montante “alto à toa”).
   */
  if (maxTopReserve >= RACK_TOP_CLEARANCE_MIN_MM - Number.EPSILON) {
    structuralTop = Math.max(structuralTop, RACK_TOP_CLEARANCE_MIN_MM);
    structuralTop = Math.min(structuralTop, RACK_TOP_CLEARANCE_MAX_MM, maxTopReserve);
  }

  return Math.min(Math.max(structuralTop, Number.EPSILON), maxTopReserve);
}
