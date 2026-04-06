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
      (fromCtx.length > 0 ? fromCtx : null) ??
      `projeto-${session.phone}.pdf`;
    const publicUrl = `/files/${filename}`;

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
        url: publicUrl,
      },
    });
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
        text: 'Largura do corredor principal em mm\n\nExemplos: 2800 ou 3000',
      };

    case 'CHOOSE_MODULE_ORIENTATION':
      return {
        to: session.phone,
        text: 'Orientação dos módulos',
        buttons: [
          { id: 'ORIENT_H', label: 'Horizontal' },
          { id: 'ORIENT_V', label: 'Vertical' },
          { id: 'ORIENT_AUTO', label: 'Melhor aproveitamento' },
        ],
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
          { id: 'TUNNEL_AP_AMBOS', label: 'Ambas' },
        ],
      };

    case 'WAIT_MODULE_DEPTH':
      return {
        to: session.phone,
        text: 'Profundidade do módulo em mm (profundidade de armazenagem)\n\nExemplo: 2700',
      };

    case 'WAIT_BEAM_LENGTH':
      return {
        to: session.phone,
        text: 'Comprimento da longarina / vão do feixe em mm\n\nExemplo: 2700 ou 3300',
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

    case 'CHOOSE_EQUAL_LEVEL_SPACING':
      return {
        to: session.phone,
        text: 'O espaçamento vertical entre níveis é uniforme?',
        buttons: [
          { id: 'ELS_SIM', label: 'Sim' },
          { id: 'ELS_NAO', label: 'Não' },
        ],
      };

    case 'WAIT_LEVEL_SPACING_SINGLE':
      return {
        to: session.phone,
        text: 'Espaçamento padrão entre níveis em mm\n\nExemplo: 1600',
      };

    case 'WAIT_LEVEL_SPACINGS_LIST':
      return {
        to: session.phone,
        text:
          'Indique os espaçamentos entre níveis em mm, do nível inferior ao superior, separados por vírgula.\n\n' +
          'Ex.: com 4 níveis são 3 espaços → 1500, 1600, 1600',
      };

    case 'WAIT_CAPACITY':
      return {
        to: session.phone,
        text: 'Capacidade por nível de feixe em kg\n\nExemplos: 1200, 1500 ou 2000',
      };

    case 'CHOOSE_HEIGHT_MODE':
      return {
        to: session.phone,
        text: 'Como definir a altura dos montantes?',
        buttons: [
          { id: 'DIRECT', label: 'Altura direta' },
          { id: 'CALC', label: 'Pela altura da carga' },
        ],
      };

    case 'WAIT_HEIGHT_DIRECT':
      return {
        to: session.phone,
        text: 'Altura útil dos montantes em mm\n\nExemplo: 5000',
      };

    case 'WAIT_LOAD_HEIGHT':
      return {
        to: session.phone,
        text: 'Altura da carga (palete + mercadoria) em mm\n\nExemplo: 1500',
      };

    case 'CHOOSE_FORKLIFT':
      return {
        to: session.phone,
        text: 'O projeto considera uso de empilhador neste layout?',
        buttons: [
          { id: 'FORK_SIM', label: 'Sim' },
          { id: 'FORK_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_HALF_MODULE':
      return {
        to: session.phone,
        text: 'Permitir meio-módulo para otimizar o espaço nas extremidades?',
        buttons: [
          { id: 'HALF_SIM', label: 'Sim' },
          { id: 'HALF_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_MIXED_MODULES':
      return {
        to: session.phone,
        text: 'Permitir módulos mistos na mesma linha (níveis/cargas diferentes)?',
        buttons: [
          { id: 'MIXED_SIM', label: 'Sim' },
          { id: 'MIXED_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_COLUMN_PROTECTOR':
      return {
        to: session.phone,
        text: 'Proteção de cantoneiras (protetores de pilar)?',
        buttons: [
          { id: 'COL_SIM', label: 'Sim' },
          { id: 'COL_NAO', label: 'Não' },
        ],
      };

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
        text: `${buildSummary(session)}\n\nToque em *Continuar* para definir a vista 3D e confirmar.`,
        buttons: [{ id: 'CONTINUAR', label: 'Continuar' }],
      };

    case 'ASK_GENERATE_3D':
      return {
        to: session.phone,
        text: 'Deseja incluir vista 3D isométrica no projeto?',
        buttons: [
          { id: 'SIM_3D', label: 'Sim' },
          { id: 'NAO_3D', label: 'Não' },
        ],
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
        text: '⏳ A gerar documento...',
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

const orientLabel = (v: unknown): string => {
  const m: Record<string, string> = {
    HORIZONTAL: 'Horizontal',
    VERTICAL: 'Vertical',
    MELHOR_APROVEITAMENTO: 'Melhor aproveitamento',
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
    AMBOS: 'Ambas',
  };
  return typeof v === 'string' ? (m[v] ?? v) : '—';
};

const projectTypeLabel = (v: unknown): string => {
  const m: Record<string, string> = {
    PLANTA_REAL: 'Planta real',
    MEDIDAS_DIGITADAS: 'Medidas digitadas',
    GALPAO_FICTICIO: 'Galpão fictício',
  };
  return typeof v === 'string' ? (m[v] ?? v) : '—';
};

function buildFinalConfirmText(session: Session): string {
  const g3d =
    session.answers.generate3d === true
      ? 'Sim'
      : session.answers.generate3d === false
        ? 'Não'
        : '—';
  return `Confirmação final\n\nIncluir 3D: ${g3d}\n\nToque em *Gerar projeto* para produzir o PDF ou *Editar* para rever secções.`;
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
    lines.push(`Corredor: ${a.corridorMm} mm`);
  }
  if (a.moduleOrientation) {
    lines.push(`Orientação dos módulos: ${orientLabel(a.moduleOrientation)}`);
  }
  if (a.lineStrategy) {
    lines.push(`Linhas: ${lineLabel(a.lineStrategy)}`);
  }
  if (a.hasTunnel === true) {
    lines.push('Túnel para empilhador: Sim');
    if (a.tunnelPosition) {
      lines.push(`  • Posição: ${posLabel(a.tunnelPosition)}`);
    }
    if (a.tunnelAppliesTo) {
      lines.push(`  • Aplica-se a: ${tunnelAppliesLabel(a.tunnelAppliesTo)}`);
    }
  } else if (a.hasTunnel === false) {
    lines.push('Túnel para empilhador: Não');
  }

  if (typeof a.moduleDepthMm === 'number') {
    lines.push(`Profundidade do módulo: ${a.moduleDepthMm} mm`);
  }
  if (typeof a.beamLengthMm === 'number') {
    lines.push(`Longarina / vão: ${a.beamLengthMm} mm`);
  }
  if (typeof a.levels === 'number') {
    lines.push(`Níveis por módulo: ${a.levels}`);
  }
  if (typeof a.firstLevelOnGround === 'boolean') {
    lines.push(`1.º nível ao chão: ${a.firstLevelOnGround ? 'Sim' : 'Não'}`);
  }
  if (typeof a.equalLevelSpacing === 'boolean') {
    lines.push(
      `Espaçamento uniforme entre níveis: ${a.equalLevelSpacing ? 'Sim' : 'Não'}`
    );
  }
  if (typeof a.levelSpacingMm === 'number') {
    lines.push(`Espaçamento entre níveis: ${a.levelSpacingMm} mm`);
  }
  if (Array.isArray(a.levelSpacingsMm) && a.levelSpacingsMm.length > 0) {
    lines.push(
      `Espaçamentos entre níveis: ${(a.levelSpacingsMm as number[]).join(', ')} mm`
    );
  }

  if (typeof a.capacityKg === 'number') {
    lines.push(`Capacidade por nível: ${a.capacityKg} kg`);
  }

  if (a.heightMode === 'DIRECT' && typeof a.heightMm === 'number') {
    lines.push(`Altura dos montantes: ${a.heightMm} mm (entrada direta)`);
  } else if (a.heightMode === 'CALC' && typeof a.loadHeightMm === 'number') {
    lines.push(`Altura da carga (base): ${a.loadHeightMm} mm (modo calculado)`);
  }

  if (typeof a.forkliftUsage === 'boolean') {
    lines.push(`Empilhador previsto: ${a.forkliftUsage ? 'Sim' : 'Não'}`);
  }
  if (typeof a.halfModuleOptimization === 'boolean') {
    lines.push(
      `Otimizar com meio-módulo: ${a.halfModuleOptimization ? 'Sim' : 'Não'}`
    );
  }
  if (typeof a.mixedModules === 'boolean') {
    lines.push(
      `Módulos mistos na mesma linha: ${a.mixedModules ? 'Sim' : 'Não'}`
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
    lines.push(`Tipo de montante: Montante ${structure.uprightType}`);
    const longarinas = budget.items.find(
      item => item.name === 'Par de Longarinas'
    );
    if (longarinas) {
      lines.push(`Pares de longarinas: ${longarinas.quantity}`);
    }
  }

  return lines.join('\n');
};
