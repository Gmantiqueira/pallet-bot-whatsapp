import { Session } from '../domain/session';
import { OutgoingMessage } from '../types/messages';
import { State } from '../domain/stateMachine';
import type { BudgetResult } from '../domain/budgetEngine';
import type { StructureResult } from '../domain/structureEngine';

export interface MessageContext {
  lastError?: string;
  statusOnly?: boolean;
  previousState?: State;
  imageAnalyzed?: boolean;
  /** Nome do ficheiro PDF em `storage` (ex.: `projeto-1730000000000.pdf`). */
  pdfFilename?: string;
}

export const buildMessages = (
  session: Session,
  ctx: MessageContext = {}
): OutgoingMessage[] => {
  const messages: OutgoingMessage[] = [];

  // Handle error message
  if (ctx.lastError) {
    messages.push({
      to: session.phone,
      type: 'text',
      text: `❌ ${ctx.lastError}`,
    });
  }

  // Handle status only (for status command)
  if (ctx.statusOnly) {
    const summary = buildSummary(session);
    messages.push({
      to: session.phone,
      type: 'text',
      text: summary,
    });
    return messages;
  }

  // Handle image analyzed message (after receiving image)
  if (ctx.imageAnalyzed && ctx.previousState === 'WAIT_PLANT_IMAGE') {
    const length = session.answers.lengthMm as number;
    const width = session.answers.widthMm as number;
    messages.push({
      to: session.phone,
      type: 'text',
      text: `✅ IMAGEM ANALISADA!\nComprimento: ${length} mm\nLargura: ${width} mm\nPorta: não detectada`,
    });
  }

  // Entrega final: texto + documento em mensagens separadas
  if (session.state === 'DONE') {
    const filename = ctx.pdfFilename ?? `projeto-${session.phone}.pdf`;
    messages.push({
      to: session.phone,
      type: 'text',
      text: 'Projeto gerado com sucesso. Segue o layout do galpão.',
    });
    messages.push({
      to: session.phone,
      type: 'document',
      document: {
        filename,
        url: `/files/${filename}`,
      },
    });
    return messages;
  }

  // Build state-specific message
  const stateMessage = buildStateMessage(session);
  if (stateMessage) {
    messages.push(stateMessage);
  }

  return messages;
};

const buildStateMessage = (session: Session): OutgoingMessage | null => {
  const state = session.state as State;

  switch (state) {
    case 'START':
      return {
        to: session.phone,
        text: 'Olá! Para começar, digite *novo*',
      };

    case 'MENU':
      return {
        to: session.phone,
        text: 'NOVO PROJETO\n\nComo deseja iniciar?\n\n1️⃣ Planta real\n2️⃣ Medidas digitadas\n3️⃣ Galpão fictício',
        buttons: [
          { id: '1', label: 'PLANTA' },
          { id: '2', label: 'MEDIDAS' },
          { id: '3', label: 'FICTICIO' },
        ],
      };

    case 'WAIT_PLANT_IMAGE':
      return {
        to: session.phone,
        text: 'Envie uma imagem da planta do galpão...\n⚠️ As medidas precisam estar visíveis.',
      };

    case 'WAIT_LENGTH':
      return {
        to: session.phone,
        text: 'Digite o comprimento em mm\n\nExemplo: 12000',
      };

    case 'WAIT_WIDTH':
      return {
        to: session.phone,
        text: 'Digite a largura em mm\n\nExemplo: 10000',
      };

    case 'WAIT_CORRIDOR':
      return {
        to: session.phone,
        text: 'Digite a largura do corredor em mm\n\nExemplos: 2800 ou 2000',
      };

    case 'WAIT_CAPACITY':
      return {
        to: session.phone,
        text: 'Digite a capacidade por nível em kg\n\nExemplos: 1200, 1500 ou 2000',
      };

    case 'CHOOSE_HEIGHT_MODE':
      return {
        to: session.phone,
        text: 'Como deseja definir a altura?\n\n• Digitar altura diretamente\n• Calcular pela carga',
        buttons: [
          { id: 'DIRECT', label: 'Digitar altura' },
          { id: 'CALC', label: 'Calcular pela carga' },
        ],
      };

    case 'WAIT_HEIGHT_DIRECT':
      return {
        to: session.phone,
        text: 'Digite a altura em mm\n\nExemplo: 5000',
      };

    case 'WAIT_LOAD_HEIGHT':
      return {
        to: session.phone,
        text: 'Digite a altura da carga em mm\n\nExemplo: 1500',
      };

    case 'WAIT_LEVELS':
      return {
        to: session.phone,
        text: 'Digite o número de níveis\n\nValor entre 1 e 12',
      };

    case 'WAIT_EXTRAS_GUARD_RAIL':
      return {
        to: session.phone,
        text: 'Guard rail:\n\nOnde deseja instalar?',
        buttons: [
          { id: 'inicio', label: 'Início' },
          { id: 'final', label: 'Final' },
          { id: 'ambos', label: 'Ambos' },
          { id: 'nao', label: 'Não' },
        ],
      };

    case 'SUMMARY_CONFIRM':
      return {
        to: session.phone,
        text: buildSummary(session),
        buttons: [
          { id: 'GERAR', label: 'Gerar documento' },
          { id: 'EDITAR', label: 'Editar' },
        ],
      };

    case 'CHOOSE_EDIT_FIELD':
      return {
        to: session.phone,
        text: 'Qual campo deseja editar?',
        buttons: [
          { id: 'MEDIDAS', label: 'Medidas' },
          { id: 'CORREDOR', label: 'Corredor' },
          { id: 'CAPACIDADE', label: 'Capacidade' },
          { id: 'ALTURA', label: 'Altura' },
          { id: 'GUARD_RAIL', label: 'Guard rail' },
          { id: 'VOLTAR_RESUMO', label: 'Voltar resumo' },
        ],
      };

    case 'GENERATING_DOC':
      return {
        to: session.phone,
        text: '⏳ Gerando documento...',
      };

    default:
      return null;
  }
};

const buildSummary = (session: Session): string => {
  const answers = session.answers;
  const lines: string[] = [];

  lines.push('📋 RESUMO DO PROJETO\n');

  if (answers.lengthMm) {
    lines.push(`Comprimento: ${answers.lengthMm} mm`);
  }
  if (answers.widthMm) {
    lines.push(`Largura: ${answers.widthMm} mm`);
  }
  if (answers.corridorMm) {
    lines.push(`Corredor: ${answers.corridorMm} mm`);
  }
  if (answers.capacityKg) {
    lines.push(`Capacidade: ${answers.capacityKg} kg`);
  }

  if (answers.heightMode === 'DIRECT' && answers.heightMm) {
    lines.push(`Altura: ${answers.heightMm} mm (direta)`);
    if (answers.levels) {
      lines.push(`Níveis: ${answers.levels}`);
    }
  } else if (answers.heightMode === 'CALC') {
    if (answers.loadHeightMm) {
      lines.push(`Altura da carga: ${answers.loadHeightMm} mm`);
    }
    if (answers.levels) {
      lines.push(`Níveis: ${answers.levels}`);
    }
  }

  if (answers.guardRail) {
    const guardRailLabels: Record<string, string> = {
      inicio: 'Início',
      final: 'Final',
      ambos: 'Ambos',
      nao: 'Não',
    };
    lines.push(`Guard rail: ${guardRailLabels[answers.guardRail as string] || answers.guardRail}`);
  }

  const budget = answers.budget as BudgetResult | undefined;
  const structure = answers.structure as StructureResult | undefined;
  if (budget?.totals && structure?.uprightType) {
    lines.push('');
    lines.push(`Módulos: ${budget.totals.modules}`);
    lines.push(`Posições: ${budget.totals.positions}`);
    lines.push(`Tipo de montante: Montante ${structure.uprightType}`);
    const longarinas = budget.items.find((i) => i.name === 'Par de Longarinas');
    if (longarinas) {
      lines.push(`Pares de longarinas: ${longarinas.quantity}`);
    }
  }

  return lines.join('\n');
};
