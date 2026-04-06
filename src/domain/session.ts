/**
 * Quando definido, ao avançar para este estado o fluxo de edição termina e volta ao resumo.
 * Evita lógica frágil com múltiplos passos no modo editar.
 */
export interface Session {
  phone: string;
  state: string;
  answers: Record<string, unknown>;
  stack: string[];
  updatedAt: number;
  /** Nome de estado (igual ao `State` da state machine) para saída antecipada no modo editar. */
  editStopBefore?: string;
}
