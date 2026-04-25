import { Session } from '../domain/session';
import { buildProjectAnswersV2 } from '../domain/pdfV2/answerMapping';
import { buildLayoutGeometry } from '../domain/pdfV2/layoutGeometryV2';
import { buildLayoutSolutionV2 } from '../domain/pdfV2/layoutSolutionV2';
import { HEIGHT_DEFINITION_WAREHOUSE_CLEAR } from '../domain/warehouseHeightDerive';
import { OutgoingMessage } from '../types/messages';
import { State } from '../domain/stateMachine';
import type { BudgetResult } from '../domain/budgetEngine';
import type { LayoutSolutionV2 } from '../domain/pdfV2/types';
import type { StructureResult } from '../domain/structureEngine';

/** Mensagem enquanto a geração do PDF está em curso (router + estado). */
export const GENERATING_DOC_WAIT_TEXT =
  '⏳ A gerar o projeto (PDF e desenhos). Isto pode demorar um pouco — aguarde.';

export interface MessageContext {
  lastError?: string;
  statusOnly?: boolean;
  previousState?: State;
  imageAnalyzed?: boolean;
  /** Nome do ficheiro PDF em `storage` (ex.: `projeto-1730000000000.pdf`). */
  pdfFilename?: string;
  /** Utilizador pediu reenvio do PDF (botão Baixar no estado DONE). */
  doneResendPdf?: boolean;
  /** Mensagem curta após gerar o Excel de orçamento no mesmo pedido. */
  budgetSuccessMessage?: string;
  /** Falha ao gerar orçamento (estado DONE; PDF pode estar ok). */
  budgetError?: string;
}

export const buildMessages = (
  session: Session,
  ctx: MessageContext = {}
): OutgoingMessage[] => {
  const messages: OutgoingMessage[] = [];

  if (ctx.lastError) {
    messages.push({
      to: session.phone,
      type: 'text',
      text: `❌ ${ctx.lastError}`,
    });
  }

  if (ctx.statusOnly) {
    const summary = buildSummary(session);
    messages.push({
      to: session.phone,
      type: 'text',
      text: summary,
    });
    return messages;
  }

  if (ctx.imageAnalyzed && ctx.previousState === 'WAIT_PLANT_IMAGE') {
    const length = session.answers.lengthMm as number;
    const width = session.answers.widthMm as number;
    messages.push({
      to: session.phone,
      type: 'text',
      text: `✅ Imagem recebida. Dimensões detetadas (revisão):\nComprimento: ${length} mm\nLargura: ${width} mm\n\nConfirme ou corrija manualmente.`,
    });
  }

  if (session.state === 'DONE') {
    const fromSession =
      typeof session.answers.pdfFilename === 'string'
        ? session.answers.pdfFilename.trim()
        : '';
    const fromCtx = ctx.pdfFilename?.trim() ?? '';
    const filename =
      (fromSession.length > 0 ? fromSession : null) ??
      (fromCtx.length > 0 ? fromCtx : null);
    if (!filename) {
      messages.push({
        to: session.phone,
        type: 'text',
        text: 'Não foi possível localizar o ficheiro do projeto. Toque em *Gerar projeto* novamente ou envie *novo* para recomeçar.',
      });
      return messages;
    }

    /**
     * Texto para o utilizador: sem anexo nem URL pública neste core.
     * O integrador interno recebe `generatedPdf` na resposta HTTP do webhook e envia o PDF pelo WhatsApp.
     */
    const textDone = ctx.doneResendPdf
      ? 'A reenviar o PDF do projeto. O integrador WhatsApp deve anexar o ficheiro novamente.'
      : 'Projeto gerado com sucesso. O PDF foi gravado; o envio pelo WhatsApp é tratado pelo integrador interno.';
    messages.push({
      to: session.phone,
      type: 'text',
      text: textDone,
      buttons: [
        { id: 'BAIXAR_PDF', label: 'Baixar PDF' },
        { id: 'GERAR_ORCAMENTO', label: 'Gerar orçamento' },
      ],
    });
    if (ctx.budgetError?.trim()) {
      messages.push({
        to: session.phone,
        type: 'text',
        text: `❌ Orçamento: ${ctx.budgetError.trim()}`,
      });
    }
    if (ctx.budgetSuccessMessage?.trim()) {
      messages.push({
        to: session.phone,
        type: 'text',
        text: ctx.budgetSuccessMessage.trim(),
      });
    }
    return messages;
  }

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
        text: 'Olá! 👋\nDigite qualquer coisa para iniciar.',
      };

    case 'MENU':
      return {
        to: session.phone,
        text: 'NOVO PROJETO\n\nComo deseja iniciar?\n\n1️⃣ Planta real\n2️⃣ Medidas digitadas',
        buttons: [
          { id: '1', label: 'PLANTA' },
          { id: '2', label: 'MEDIDAS' },
        ],
      };

    case 'WAIT_PLANT_IMAGE':
      return {
        to: session.phone,
        text: 'Envie uma foto, impressão ou esboço da planta do galpão.\n⚠️ As medidas devem estar visíveis.',
      };

    case 'WAIT_PLANT_CONFIRM_DIMS':
      return {
        to: session.phone,
        text: 'As dimensões acima estão corretas?',
        buttons: [
          { id: 'CONFIRMAR_DIMS', label: 'Confirmar' },
          { id: 'CORRIGIR_MANUAL', label: 'Corrigir manual' },
        ],
      };

    case 'WAIT_LENGTH':
      return {
        to: session.phone,
        text: 'Digite o comprimento do galpão em mm\n\nExemplo: 12000',
      };

    case 'WAIT_WIDTH':
      return {
        to: session.phone,
        text: 'Digite a largura do galpão em mm\n\nExemplo: 10000',
      };

    case 'WAIT_CORRIDOR':
      return {
        to: session.phone,
        text:
          'Largura do corredor principal (mm), ou 0 se não houver corredor entre fileiras\n\n' +
            'Válido: 0 (só com linha simples, p.ex. fileira encostada à parede) ou entre 500 e 6000 mm. Exemplos: 800, 2800, 3000',
        buttons: [{ id: 'SEM_CORREDOR', label: 'Sem corredor' }],
      };

    case 'CHOOSE_LINE_STRATEGY':
      return {
        to: session.phone,
        text: 'Estratégia de linhas de armazenagem',
        buttons: [
          { id: 'LINE_SIMPLES', label: 'Só linhas simples' },
          { id: 'LINE_DUPLOS', label: 'Só linhas duplas' },
          { id: 'LINE_MELHOR', label: 'Melhor layout' },
        ],
      };

    case 'CHOOSE_TUNNEL':
      return {
        to: session.phone,
        text: 'Haverá túnel para empilhador entre linhas?',
        buttons: [
          { id: 'TUNNEL_SIM', label: 'Sim' },
          { id: 'TUNNEL_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_TUNNEL_POSITION':
      return {
        to: session.phone,
        text: 'Posição do túnel ao longo do armazém',
        buttons: [
          { id: 'TUNNEL_INICIO', label: 'Início' },
          { id: 'TUNNEL_MEIO', label: 'Meio' },
          { id: 'TUNNEL_FIM', label: 'Fim' },
        ],
      };

    case 'CHOOSE_TUNNEL_APPLIES':
      return {
        to: session.phone,
        text: 'O túnel aplica-se a quais linhas?',
        buttons: [
          { id: 'TUNNEL_AP_SIMPLES', label: 'Linhas simples' },
          { id: 'TUNNEL_AP_DUPLOS', label: 'Linhas duplas' },
          { id: 'TUNNEL_AP_UMA', label: 'Uma linha' },
          { id: 'TUNNEL_AP_AMBOS', label: 'Ambas' },
        ],
      };

    case 'WAIT_MODULE_DEPTH':
      return {
        to: session.phone,
        text: 'Profundidade da posição (palete) em mm\n\nExemplos: 1000 ou 1100',
      };

    case 'CHOOSE_HEIGHT_DEFINITION':
      return {
        to: session.phone,
        text:
          'Como pretende definir a altura?\n\n• Altura do módulo — indica a altura total da estrutura (como até agora).\n• Pé-direito do galpão — indica a altura útil do edifício; calculamos a altura do módulo (múltiplos de 80 mm) e o maior número de níveis possível, sem ultrapassar o pé-direito (folga superior de 216 mm incluída no modelo).',
        buttons: [
          { id: 'HD_ALTURA_MODULO', label: 'Altura do módulo' },
          { id: 'HD_PEDIREITO', label: 'Pé-direito' },
        ],
      };

    case 'WAIT_WAREHOUSE_CLEAR_HEIGHT':
      return {
        to: session.phone,
        text:
          'Pé-direito útil do galpão (altura interior disponível) em mm\n\nA estrutura não ultrapassará este valor. Ex.: 10000',
      };

    case 'WAIT_LOAD_HEIGHT_FOR_SPACING':
      return {
        to: session.phone,
        text:
          'Espaçamento mínimo entre eixos consecutivos de longarina (mm)\n\nServe para maximizar níveis dentro do pé-direito. Entre 800 e 5000. Ex.: 1200',
      };

    case 'WAIT_LEVELS':
      return {
        to: session.phone,
        text: 'Número de níveis de feixe por módulo\n\nEntre 1 e 12',
      };

    case 'CHOOSE_FIRST_LEVEL_GROUND':
      return {
        to: session.phone,
        text: 'O primeiro nível de feixe fica ao nível do piso?',
        buttons: [
          { id: 'FLG_SIM', label: 'Sim' },
          { id: 'FLG_NAO', label: 'Não' },
        ],
      };

    case 'WAIT_CAPACITY':
      return {
        to: session.phone,
        text: 'Capacidade por nível de feixe em kg\n\nExemplos: 1200, 1500 ou 2000',
      };

    case 'WAIT_HEIGHT_DIRECT':
      return {
        to: session.phone,
        text:
          'Altura útil do sistema em mm (múltiplos de 80 mm — valores intermédios são alinhados automaticamente).\n\nExemplo: 5040',
      };

    case 'CHOOSE_COLUMN_PROTECTOR': {
      const a = session.answers;
      const fromRaw = a.heightMmAdjustedFrom;
      const adjusted =
        typeof fromRaw === 'number' &&
        typeof a.heightMm === 'number' &&
        fromRaw !== a.heightMm;
      const prefix = adjusted
        ? `✅ Altura ajustada de ${fromRaw} mm para ${a.heightMm} mm (passo de coluna 80 mm).\n\n`
        : '';
      return {
        to: session.phone,
        text: `${prefix}Proteção de cantoneiras (protetores de pilar)?`,
        buttons: [
          { id: 'COL_SIM', label: 'Sim' },
          { id: 'COL_NAO', label: 'Não' },
        ],
      };
    }

    case 'CHOOSE_GUARD_RAIL_SIMPLE':
      return {
        to: session.phone,
        text: 'Guarda simples (nível inferior)?',
        buttons: [
          { id: 'GRS_SIM', label: 'Sim' },
          { id: 'GRS_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_GUARD_RAIL_SIMPLE_POS':
      return {
        to: session.phone,
        text: 'Posição da guarda simples',
        buttons: [
          { id: 'GRSP_INICIO', label: 'Início' },
          { id: 'GRSP_FINAL', label: 'Final' },
          { id: 'GRSP_AMBOS', label: 'Ambos' },
        ],
      };

    case 'CHOOSE_GUARD_RAIL_DOUBLE':
      return {
        to: session.phone,
        text: 'Guarda dupla?',
        buttons: [
          { id: 'GRD_SIM', label: 'Sim' },
          { id: 'GRD_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_GUARD_RAIL_DOUBLE_POS':
      return {
        to: session.phone,
        text: 'Posição da guarda dupla',
        buttons: [
          { id: 'GRDP_INICIO', label: 'Início' },
          { id: 'GRDP_FINAL', label: 'Final' },
          { id: 'GRDP_AMBOS', label: 'Ambos' },
        ],
      };

    case 'SUMMARY_CONFIRM':
      return {
        to: session.phone,
        text: `${buildSummary(session)}\n\nToque em *Continuar* para confirmar e gerar o projeto.`,
        buttons: [{ id: 'CONTINUAR', label: 'Continuar' }],
      };

    case 'ASK_GENERATE_3D':
      return {
        to: session.phone,
        text: 'A vista 3D isométrica está incluída no projeto.\n\nToque em *Continuar* para a confirmação final.',
        buttons: [{ id: 'CONTINUAR', label: 'Continuar' }],
      };

    case 'FINAL_CONFIRM':
      return {
        to: session.phone,
        text: buildFinalConfirmText(session),
        buttons: [
          { id: 'GERAR', label: 'Gerar projeto' },
          { id: 'EDITAR', label: 'Editar' },
        ],
      };

    case 'CHOOSE_EDIT_FIELD':
      return {
        to: session.phone,
        text: 'Qual secção deseja alterar?',
        buttons: [
          { id: 'EDIT_MEDIDAS', label: 'Medidas galpão' },
          { id: 'EDIT_LAYOUT', label: 'Layout' },
          { id: 'EDIT_MODULO', label: 'Módulo' },
          { id: 'EDIT_CARGA', label: 'Carga e altura' },
          { id: 'EDIT_PROTECOES', label: 'Proteções' },
          { id: 'VOLTAR_RESUMO', label: 'Voltar' },
        ],
      };

    case 'GENERATING_DOC':
      return {
        to: session.phone,
        text: GENERATING_DOC_WAIT_TEXT,
      };

    default:
      return null;
  }
};

const posLabel = (v: unknown): string => {
  const m: Record<string, string> = {
    INICIO: 'Início',
    FINAL: 'Final',
    AMBOS: 'Ambos',
    MEIO: 'Meio',
    FIM: 'Fim',
  };
  return typeof v === 'string' ? (m[v] ?? v) : '—';
};

const lineLabel = (v: unknown): string => {
  const m: Record<string, string> = {
    APENAS_SIMPLES: 'Apenas linhas simples',
    APENAS_DUPLOS: 'Apenas linhas duplas',
    MELHOR_LAYOUT: 'Melhor layout',
  };
  return typeof v === 'string' ? (m[v] ?? v) : '—';
};

const tunnelAppliesLabel = (v: unknown): string => {
  const m: Record<string, string> = {
    LINHAS_SIMPLES: 'Linhas simples',
    LINHAS_DUPLOS: 'Linhas duplas',
    UMA: 'Uma linha (primeira fileira)',
    AMBOS: 'Ambas',
  };
  return typeof v === 'string' ? (m[v] ?? v) : '—';
};

const projectTypeLabel = (v: unknown): string => {
  const m: Record<string, string> = {
    PLANTA_REAL: 'Planta real',
    MEDIDAS_DIGITADAS: 'Medidas digitadas',
  };
  return typeof v === 'string' ? (m[v] ?? v) : '—';
};

function buildFinalConfirmText(_session: Session): string {
  return `Confirmação final\n\nToque em *Gerar projeto* para produzir o PDF ou *Editar* para rever secções.`;
}

const buildSummary = (session: Session): string => {
  const a = session.answers;
  const lines: string[] = [];

  lines.push('📋 RESUMO DO PROJETO\n');

  if (a.projectType) {
    lines.push(`Tipo de projeto: ${projectTypeLabel(a.projectType)}`);
  }
  if (a.dimensionsFromPlant === true) {
    lines.push('Dimensões: a partir da planta (confirmadas)');
  } else if (a.dimensionsFromPlant === false) {
    lines.push('Dimensões: introduzidas manualmente');
  }

  if (typeof a.lengthMm === 'number') {
    lines.push(`Comprimento: ${a.lengthMm} mm`);
  }
  if (typeof a.widthMm === 'number') {
    lines.push(`Largura: ${a.widthMm} mm`);
  }
  if (typeof a.corridorMm === 'number') {
    lines.push(
      a.corridorMm <= 0
        ? 'Corredor principal: sem (0 mm)'
        : `Corredor: ${a.corridorMm} mm`
    );
  }
  if (a.lineStrategy) {
    lines.push(`Linhas: ${lineLabel(a.lineStrategy)}`);
  }
  /**
   * Túnel no resumo = layout calculado (módulo túnel real), não só `answers.hasTunnel`.
   */
  let tunnelForSummary: boolean | undefined =
    typeof a.hasTunnel === 'boolean' ? a.hasTunnel : undefined;
  let layoutForTunnel: LayoutSolutionV2 | null = null;
  const v2 = buildProjectAnswersV2(a);
  if (v2) {
    layoutForTunnel = buildLayoutSolutionV2(v2);
    const geo = buildLayoutGeometry(layoutForTunnel, a as Record<string, unknown>);
    tunnelForSummary = geo.metadata.hasTunnel;
  }
  if (tunnelForSummary === true) {
    lines.push('Túnel para empilhador: Sim');
    const effOff = layoutForTunnel?.metadata.tunnelOffsetEffectiveMm;
    if (typeof effOff === 'number') {
      lines.push(
        `  • Início do vão ao longo da fileira: ${effOff.toLocaleString('pt-BR')} mm`
      );
    } else if (a.tunnelPosition) {
      lines.push(`  • Posição: ${posLabel(a.tunnelPosition)}`);
    }
    if (a.tunnelAppliesTo) {
      lines.push(`  • Aplica-se a: ${tunnelAppliesLabel(a.tunnelAppliesTo)}`);
    }
  } else if (tunnelForSummary === false) {
    lines.push('Túnel para empilhador: Não');
  }

  if (typeof a.moduleDepthMm === 'number') {
    lines.push(`Profundidade da posição (palete): ${a.moduleDepthMm} mm`);
  }
  if (typeof a.levels === 'number') {
    lines.push(`Níveis por módulo: ${a.levels}`);
  }
  if (typeof a.firstLevelOnGround === 'boolean') {
    lines.push(`1.º nível ao chão: ${a.firstLevelOnGround ? 'Sim' : 'Não'}`);
  }
  if (typeof a.hasGroundLevel === 'boolean') {
    lines.push(
      `Patamar de palete no piso (sem longarina): ${a.hasGroundLevel ? 'Sim' : 'Não'}`
    );
  }

  if (typeof a.capacityKg === 'number') {
    lines.push(`Capacidade por nível: ${a.capacityKg} kg`);
  }

  if (typeof a.heightMm === 'number') {
    lines.push(`Altura útil do sistema: ${a.heightMm} mm`);
  }
  if (a.heightDefinitionMode === HEIGHT_DEFINITION_WAREHOUSE_CLEAR) {
    if (typeof a.warehouseClearHeightMm === 'number') {
      lines.push(`Pé-direito do galpão (limite): ${a.warehouseClearHeightMm} mm`);
    }
    if (typeof a.warehouseMinBeamGapMm === 'number') {
      lines.push(
        `Espaçamento mín. entre eixos de longarina (critério): ${a.warehouseMinBeamGapMm} mm`
      );
    }
    lines.push(
      'Altura do módulo e níveis calculados automaticamente (máx. níveis, passo 80 mm, folga superior 216 mm).'
    );
  }

  if (typeof a.columnProtector === 'boolean') {
    lines.push(`Protetores de pilar: ${a.columnProtector ? 'Sim' : 'Não'}`);
  }
  if (a.guardRailSimple === false) {
    lines.push('Guarda simples: Não');
  } else if (a.guardRailSimple === true) {
    lines.push(`Guarda simples: Sim (${posLabel(a.guardRailSimplePosition)})`);
  }
  if (a.guardRailDouble === false) {
    lines.push('Guarda dupla: Não');
  } else if (a.guardRailDouble === true) {
    lines.push(`Guarda dupla: Sim (${posLabel(a.guardRailDoublePosition)})`);
  }

  const budget = a.budget as BudgetResult | undefined;
  const structure = a.structure as StructureResult | undefined;
  if (budget?.totals && structure?.uprightType) {
    lines.push('');
    lines.push('— Estimativa técnica —');
    lines.push(`Módulos: ${budget.totals.modules}`);
    lines.push(`Posições: ${budget.totals.positions}`);
    lines.push(`Coluna selecionada: ${structure.uprightType}`);
    const longarinas = budget.items.find(
      item => item.name === 'Par de Longarinas'
    );
    if (longarinas) {
      lines.push(`Pares de longarinas: ${longarinas.quantity}`);
    }
  }

  return lines.join('\n');
};
