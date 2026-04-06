/** Validação e parsing partilhados entre estados da conversa (mm, kg, listas). */

export const MIN_MM = 500;
export const MAX_MM = 200000;
export const MIN_CORRIDOR = 1000;
export const MAX_CORRIDOR = 6000;
export const MIN_KG = 100;
export const MAX_KG = 5000;
export const MIN_LEVELS = 1;
export const MAX_LEVELS = 12;
/** Espaçamento vertical entre níveis (mm) — intervalo prático para armazenagem. */
export const MIN_LEVEL_GAP_MM = 800;
export const MAX_LEVEL_GAP_MM = 5000;

export const parseNumber = (text: string): number | null => {
  const cleaned = text.trim().replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
};

/** Aceita vírgula ou ponto e vírgula como separador. */
export const parseCommaSeparatedNumbers = (text: string): number[] | null => {
  const parts = text
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return null;
  }
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseNumber(p);
    if (n === null) {
      return null;
    }
    nums.push(n);
  }
  return nums;
};

export const validateMm = (value: number): string | null => {
  if (value < MIN_MM || value > MAX_MM) {
    return `Valor deve estar entre ${MIN_MM} e ${MAX_MM} mm`;
  }
  return null;
};

export const validateCorridor = (value: number): string | null => {
  if (value < MIN_CORRIDOR || value > MAX_CORRIDOR) {
    return `Corredor deve estar entre ${MIN_CORRIDOR} e ${MAX_CORRIDOR} mm`;
  }
  return null;
};

export const validateKg = (value: number): string | null => {
  if (value < MIN_KG || value > MAX_KG) {
    return `Capacidade deve estar entre ${MIN_KG} e ${MAX_KG} kg`;
  }
  return null;
};

export const validateLevels = (value: number): string | null => {
  if (value < MIN_LEVELS || value > MAX_LEVELS) {
    return `Níveis deve estar entre ${MIN_LEVELS} e ${MAX_LEVELS}`;
  }
  return null;
};

export const validateLevelGap = (value: number): string | null => {
  if (value < MIN_LEVEL_GAP_MM || value > MAX_LEVEL_GAP_MM) {
    return `Espaçamento deve estar entre ${MIN_LEVEL_GAP_MM} e ${MAX_LEVEL_GAP_MM} mm`;
  }
  return null;
};

export const validateLevelGapsList = (
  gaps: number[],
  expectedCount: number
): string | null => {
  if (gaps.length !== expectedCount) {
    return `Indique exatamente ${expectedCount} valor(es) separados por vírgula`;
  }
  for (const g of gaps) {
    const err = validateLevelGap(g);
    if (err) {
      return err;
    }
  }
  return null;
};
