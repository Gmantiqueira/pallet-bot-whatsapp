import { Session } from '../domain/session';
import { OutgoingMessage } from '../types/messages';
import { State } from '../domain/stateMachine';

export interface MessageContext {
  lastError?: string;
  statusOnly?: boolean;
  previousState?: State;
  imageAnalyzed?: boolean;
  pdfUrl?: string;
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
      text: `❌ ${ctx.lastError}`,
    });
  }

  // Handle status only (for status command)
  if (ctx.statusOnly) {
    const summary = buildSummary(session);
    messages.push({
      to: session.phone,
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
      text: `✅ IMAGEM ANALISADA!\nComprimento: ${length} mm\nLargura: ${width} mm\nPorta: não detectada`,
    });
  }

  // Build state-specific message
  const stateMessage = buildStateMessage(session, ctx);
  if (stateMessage) {
    messages.push(stateMessage);
  }

  return messages;
};

const buildStateMessage = (
  session: Session,
  ctx: MessageContext
): OutgoingMessage | null => {
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

    case 'GENERATING_DOC':
      return {
        to: session.phone,
        text: '⏳ Gerando documento...',
      };

    case 'DONE':
      // Use PDF URL from context if available
      const pdfUrl = ctx.pdfUrl || `/files/projeto-${session.phone}-${Date.now()}.pdf`;
      const pdfFilename = ctx.pdfFilename || `projeto-${session.phone}.pdf`;
      return {
        to: session.phone,
        text: '✅ Projeto concluído',
        document: {
          filename: pdfFilename,
          url: pdfUrl,
        },
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

  return lines.join('\n');
};
