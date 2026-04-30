/** Validação e parsing partilhados entre estados da conversa (mm, kg, listas). */

export const MIN_MM = 500;
export const MAX_MM = 200000;
/** Corredor operacional mínimo (mm) — alinhado a medidas de galpão; 0 = sem corredor principal. */
export const MIN_CORRIDOR = 500;
export const MAX_CORRIDOR = 6000;
export const MIN_KG = 100;
export const MAX_KG = 5000;
/** Máx. de fileiras simples/duplas (cada) em composição personalizada — evita erros grosseiros. */
export const MAX_LINE_ROWS = 20;
export const MIN_LEVELS = 1;
export const MAX_LEVELS = 12;
/** Espaçamento vertical entre níveis (mm) — intervalo prático para armazenagem. */
export const MIN_LEVEL_GAP_MM = 800;
export const MAX_LEVEL_GAP_MM = 5000;
/** Largura da espinha / rua entre costas (fileira dupla), mm. */
export const MIN_SPINE_BACK_TO_BACK_MM = 40;
export const MAX_SPINE_BACK_TO_BACK_MM = 5000;

export const parseNumber = (text: string): number | null => {
  const cleaned = text.trim().replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
};

/** Aceita vírgula ou ponto e vírgula como separador. */
export const parseCommaSeparatedNumbers = (text: string): number[] | null => {
  const parts = text
    .split(/[,;]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
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

export type ParseModuleIndexListResult =
  | { ok: true; indices: number[] }
  | { ok: false; error: string };

/**
 * Lista de números de módulo (túnel manual): vírgula, espaço, «e», ponto **entre dígitos**
 * é sempre separador — não decimal (ex.: «2.5» → 2 e 5).
 */
export function parseModuleIndexListResult(
  text: string
): ParseModuleIndexListResult {
  let t = text.replace(/\u00a0/g, ' ').trim();
  if (!t) {
    return {
      ok: false,
      error:
        'Indique pelo menos um número de módulo inteiro (≥ 1), por exemplo: 2, 5 ou 2 e 8.',
    };
  }

  t = t.replace(/módulos?/gi, ' ');
  t = t.replace(/\s+e\s+/gi, ',');

  /** Ponto entre dois dígitos = separador (cadeias 2.5.8 → vírgulas). */
  for (let guard = 0; guard < 40; guard++) {
    const next = t.replace(/(\d)\s*\.\s*(\d)/g, '$1,$2');
    if (next === t) break;
    t = next;
  }

  if (/\d\s*\.\s*\d/.test(t)) {
    return {
      ok: false,
      error:
        'Há um «.» entre números que não foi reconhecido como separador. Use vírgula ou espaço entre módulos (ex.: 2, 5 ou 2 5).',
    };
  }

  t = t.replace(/\s*[,;]\s*/g, ',');

  const rawParts = t
    .split(/[,]+|\s+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (rawParts.length === 0) {
    return {
      ok: false,
      error:
        'Não foi possível ler números. Use inteiros separados por vírgula, espaço, «e» ou ponto entre dígitos (ex.: 2, 5 · 2.5).',
    };
  }

  const nums: number[] = [];
  for (const part of rawParts) {
    if (!/^\d+$/.test(part)) {
      return {
        ok: false,
        error: `«${part}» não é válido: cada parte deve ser só dígitos (número de módulo inteiro). Separe números com vírgula, espaço ou ponto (ex.: 2.5 → módulos 2 e 5).`,
      };
    }
    const n = parseInt(part, 10);
    if (!Number.isInteger(n) || n < 1) {
      return {
        ok: false,
        error: 'Cada número deve ser um inteiro ≥ 1.',
      };
    }
    nums.push(n);
  }

  const indices = [...new Set(nums)].sort((a, b) => a - b);
  return { ok: true, indices };
}

/** Compatível com chamadas que só precisam da lista (entradas inválidas → []). */
export function parseModuleIndexList(text: string): number[] {
  const r = parseModuleIndexListResult(text);
  return r.ok ? r.indices : [];
}

/**
 * Resposta ao passo «indique os módulos com túnel»: utilizador renuncia a túneis (mantém o projeto).
 */
export function matchesTunnelManualNoneReply(text: string): boolean {
  const raw = text.replace(/\u00a0/g, ' ').trim().toLowerCase();
  if (!raw) return false;
  const t = raw.replace(/\s+/g, ' ');
  if (t === 'nenhum' || t === '0' || t === 'zero') return true;
  if (/^sem\s+t[uú]nel(es)?$/u.test(t) || /^sem\s+t[uú]neis$/u.test(t))
    return true;
  if (
    /^nenhum\s+t[uú]nel(es)?$/u.test(t) ||
    /^nenhum\s+t[uú]neis$/u.test(t)
  )
    return true;
  return false;
}

export const validateMm = (value: number): string | null => {
  if (value < MIN_MM || value > MAX_MM) {
    return `Valor deve estar entre ${MIN_MM} e ${MAX_MM} mm`;
  }
  return null;
};

export const validateCorridor = (value: number): string | null => {
  if (value === 0) {
    return null;
  }
  if (value < MIN_CORRIDOR || value > MAX_CORRIDOR) {
    return `Use 0 para sem corredor principal, ou indique entre ${MIN_CORRIDOR} e ${MAX_CORRIDOR} mm`;
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

export const validateSpineBackToBackMm = (value: number): string | null => {
  if (
    value < MIN_SPINE_BACK_TO_BACK_MM ||
    value > MAX_SPINE_BACK_TO_BACK_MM
  ) {
    return `Largura da rua dupla (distanciador) entre ${MIN_SPINE_BACK_TO_BACK_MM} e ${MAX_SPINE_BACK_TO_BACK_MM} mm`;
  }
  return null;
};

/** Contagem 0..MAX_LINE_ROWS; simples+duplas ≥ 1. */
export const validateCustomLineRowCount = (value: number): string | null => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_LINE_ROWS) {
    return `Indique um número inteiro entre 0 e ${MAX_LINE_ROWS}`;
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
