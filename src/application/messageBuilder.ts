import { Session } from '../domain/session';
import { buildProjectAnswersV2 } from '../domain/pdfV2/answerMapping';
import { buildLayoutGeometry } from '../domain/pdfV2/layoutGeometryV2';
import { buildLayoutSolutionV2 } from '../domain/pdfV2/layoutSolutionV2';
import { HEIGHT_DEFINITION_WAREHOUSE_CLEAR } from '../domain/warehouseHeightDerive';
import { OutgoingMessage } from '../types/messages';
import { State } from '../domain/stateMachine';
import type { BudgetResult } from '../domain/budgetEngine';
import type { LayoutSolutionV2 } from '../domain/pdfV2/types';
import { formatModuleSpanCountsCommercialPt } from '../domain/pdfV2/formatModuleCountDisplay';
import type { StructureResult } from '../domain/structureEngine';

/** Mensagem enquanto a geração do PDF está em curso (router + estado). */
export const GENERATING_DOC_WAIT_TEXT =
  '⏳ A gerar o projeto (PDF e desenhos). Isto pode demorar um pouco — aguarde.';

export const GENERATING_TUNNEL_PREVIEW_WAIT_TEXT =
  '⏳ A preparar a prévia do layout com módulos numerados — aguarde um momento.';

export interface MessageContext {
  lastError?: string;
  statusOnly?: boolean;
  previousState?: State;
  imageAnalyzed?: boolean;
  /** Nome do ficheiro PDF em `storage` (ex.: `projeto-1730000000000.pdf`). */
  pdfFilename?: string;
  /** Utilizador pediu reenvio do PDF (botão Baixar no estado DONE). */
  doneResendPdf?: boolean;
  /** Reenvio da prévia com módulos numerados (botão Baixar nesse passo). */
  tunnelPreviewResendPdf?: boolean;
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

  if (
    ctx.tunnelPreviewResendPdf === true &&
    session.state === 'WAIT_TUNNEL_MODULE_NUMBERS'
  ) {
    messages.push({
      to: session.phone,
      type: 'text',
      text:
        '📎 A reenviar o PDF da prévia. O integrador WhatsApp deve voltar a anexar o mesmo ficheiro.',
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
        text:
          'Vamos orientar o projeto por ordem natural do espaço: medições → estrutura da sala → módulo e túnel → altura → carga → proteções → documentos.\n\n' +
          '*NOVO PROJETO*\n\nComo deseja iniciar?\n\n1️⃣ Planta real\n2️⃣ Medidas digitadas',
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
        text:
          'Estratégia de linhas de armazenagem\n\n' +
            'Pode tocar no botão ou escrever: *1* simples, *2* duplas, *3* melhor, *4* personalizado (definir quantas simples/duplas; implantação no eixo transversal: *duplas depois simples*).',
        buttons: [
          { id: 'LINE_SIMPLES', label: 'Só linhas simples' },
          { id: 'LINE_DUPLOS', label: 'Só linhas duplas' },
          { id: 'LINE_MELHOR', label: 'Melhor layout' },
        ],
      };

    case 'WAIT_LINE_CUSTOM_SIMPLES':
      return {
        to: session.phone,
        text:
          'Número de *linhas de armazenagem simples* (fileiras, eixo transversal ao vão)\n\n' +
            '0–20, inteiro. Ex.: 0 se só houver fileiras em dupla costas.',
      };

    case 'WAIT_LINE_CUSTOM_DUPLOS':
      return {
        to: session.phone,
        text:
          'Número de *linhas em dupla costas* (fileiras duplas, eixo transversal ao vão)\n\n' +
            '0–20, inteiro. Ex.: 0 se só tiver fileiras simples. Ordem no desenho: primeiro as duplas, depois as simples.',
      };

    case 'WAIT_SPINE_BACK_TO_BACK':
      return {
        to: session.phone,
        text:
          'Largura da *rua dupla* entre costas (mm)\n\n' +
            'Define o canal central (espinha) na fileira em dupla costas e a referência de tamanho do distanciador. Ex.: 100 (comum) ou 120.',
      };

    case 'CHOOSE_TUNNEL':
      return {
        to: session.phone,
        text:
          'Haverá túnel para empilhador entre linhas?\n\n' +
            'Com túnel, o desenho inclui guarda-corpo (guarda rail) de forma automática, sem alterar o aspeto dos túneis no PDF.',
        buttons: [
          { id: 'TUNNEL_SIM', label: 'Sim' },
          { id: 'TUNNEL_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_TUNNEL_STRATEGY':
      return {
        to: session.phone,
        text:
          'Como deseja definir *onde* ficam os túneis?\n\n' +
            '• *Assistente* — indica quantos túneis e as posições (início / meio / fim) ao longo do vão, como antes.\n' +
            '• *Manual* — de seguida recebe um PDF de pré-visualização com *todos os módulos de frente numerados*; responde com os números onde quer túnel (p.ex. 2, 5, 8). O desenho final mantém o mesmo padrão visual; a numeração é só apoio à escolha.',
        buttons: [
          { id: 'TUNNEL_STR_ASSISTED', label: 'Assistente' },
          { id: 'TUNNEL_STR_MANUAL', label: 'Manual' },
        ],
      };

    case 'CHOOSE_TUNNEL_COUNT':
      return {
        to: session.phone,
        text:
          'Quantos túneis ao longo do eixo do vão (comprimento da fileira)?\n\n' +
            'Pode ter até 3. Em seguida define a posição (início / meio / fim) de cada um. Em geral, quanto maior o compartimento no sentido do vão, mais vãos cabem sem se sobreporem.',
        buttons: [
          { id: 'TUNNEL_NUM_1', label: '1' },
          { id: 'TUNNEL_NUM_2', label: '2' },
          { id: 'TUNNEL_NUM_3', label: '3' },
        ],
      };

    case 'CHOOSE_TUNNEL_POSITION': {
      const slotN =
        typeof session.answers.tunnelSlotCount === 'number'
          ? session.answers.tunnelSlotCount
          : 1;
      const got = Array.isArray(session.answers.tunnelPlacements)
        ? (session.answers.tunnelPlacements as unknown[]).length
        : 0;
      const i = got + 1;
      return {
        to: session.phone,
        text:
          (slotN > 1
            ? `Posição do túnel *${i}* de *${slotN}* ao longo do armazém (eixo do vão)\n\n`
            : 'Posição do túnel ao longo do armazém\n\n') +
            'Em qualquer fileira com túnel, o módulo túnel e a guarda no desenho seguem o mesmo padrão visual de sempre.',
        buttons: [
          { id: 'TUNNEL_INICIO', label: 'Início' },
          { id: 'TUNNEL_MEIO', label: 'Meio' },
          { id: 'TUNNEL_FIM', label: 'Fim' },
        ],
      };
    }

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

    case 'CHOOSE_MODULE_DIMENSION_MODE':
      return {
        to: session.phone,
        text:
          'Como deseja definir a profundidade de posição e o vão por baia (longarina)?\n\n' +
            '• *Medidas do palete* — indica a profundidade e a *frente* do palete; calculamos profundidade de montante e vão.\n' +
            '• *Manual* — indica diretamente a profundidade do montante e o tamanho do vão (longarina).\n\n' +
            'O desenho final do PDF usa sempre os *valores resultantes* (só muda a forma de os introduzir).',
        buttons: [
          { id: 'MDM_PALLET', label: 'Medidas do palete' },
          { id: 'MDM_MANUAL', label: 'Manual' },
        ],
      };

    case 'WAIT_PALLET_DEPTH':
      return {
        to: session.phone,
        text:
          'Profundidade do *palete* (mm), no sentido da posição (entrada da carga; transversal ao vão do corredor).\n\n' +
            'A profundidade de posição (montante) calcula-se como: palete − 200 mm. Mín. palete: 700 mm.',
      };

    case 'WAIT_PALLET_FRONT':
      return {
        to: session.phone,
        text:
          'Frente / *largura* do *palete* (mm), ao longo do eixo de circulação do empilhador (medida típica da carga vinda da frente).\n\n' +
            'Assim que enviar o valor, calculamos e mostramos logo a *profundidade de posição* e o *vão* (longarina).\n\n' +
            'Fórmula do vão: *2 × frente + 300* mm; a profundidade de posição segue a regra do palete já indicada.',
      };

    case 'WAIT_MODULE_DEPTH':
      return {
        to: session.phone,
        text:
          'Profundidade de *posição* = profundidade do *montante* (mm)\n\n' +
            'Eixo *transversal* ao vão, uma costa. Ex.: 2700 (é o que o desenho usa na faixa, como até agora).',
      };

    case 'WAIT_BEAM_LENGTH':
      return {
        to: session.phone,
        text:
          'Tamanho do *vão por baia* (mm) — largura de entrada das longarinas, por baia\n\n' +
            'Ex.: 1100. É o valor que o layout usa no eixo *do vão* (igual a indicar a “medida de longarina” de entrada em modo manual).',
      };

    case 'CHOOSE_HEIGHT_DEFINITION': {
      const md = session.answers.moduleDepthMm;
      const bl = session.answers.beamLengthMm;
      const pf = session.answers.palletFrontMm;
      let lead = '';
      if (typeof md === 'number' && typeof bl === 'number') {
        lead =
          `Módulo atual: profundidade de posição *${md}* mm · vão *${bl}* mm` +
          (typeof pf === 'number'
            ? ` (calculado com frente do palete *${pf}* mm).\n\n`
            : `.\n\n`);
      }
      return {
        to: session.phone,
        text:
          lead +
          'Agora vamos à *altura*.\n\n' +
          'Como pretende definir a altura?\n\n• Altura do módulo — indica a altura total da estrutura (como até agora).\n• Pé-direito do galpão — indica a altura útil do edifício; calculamos a altura do módulo (múltiplos de 80 mm) e o maior número de níveis possível, sem ultrapassar o pé-direito (folga superior ao último nível típica ~300 mm incluída no modelo).',
        buttons: [
          { id: 'HD_ALTURA_MODULO', label: 'Altura do módulo' },
          { id: 'HD_PEDIREITO', label: 'Pé-direito' },
        ],
      };
    }

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
        text:
          'Número de níveis de feixe por módulo\n\n' +
            'Entre 1 e 12. Com *mais de um* nível, a seguir pergunta-se o *espaçamento entre eixos* (igual em todos os patamares ou variável de nível a nível). A vista frontal mantém o mesmo padrão de desenho — só as cotas ajustam-se.',
      };

    case 'CHOOSE_LEVEL_SPACING_MODE':
      return {
        to: session.phone,
        text:
          'Espaçamento *entre eixos de feixe* (longarinas) ao longo do montante\n\n' +
            '• *Igual* — um único valor (mm) em todos os intervalos entre eixos consecutivos\n' +
            '• *Variável* — indica cada altura (mm) *entre* eixos, na ordem de baixo para cima, separada por vírgula\n\n' +
            'Cálculo: respeita a altura total do módulo e a folga superior; se os valores não couberem, o sistema ajusta *proporcionalmente* o espaçamento (igual a como já funcionava a distribuição automática).',
        buttons: [
          { id: 'LVL_GAP_IGUAL', label: 'Igual' },
          { id: 'LVL_GAP_VARIAVEL', label: 'Variável' },
        ],
      };

    case 'WAIT_LEVEL_SPACING_UNIFORM':
      return {
        to: session.phone,
        text:
          'Espaçamento *igual* entre eixos consecutivos (mm)\n\n' +
            'Intervalo entre 800 e 5000. Ex.: 1500. Aplica-se a *todos* os vãos entre feixe e feixe, no espaço útil abaixo da reserva superior do montante.',
      };

    case 'WAIT_LEVEL_SPACINGS_LIST': {
      const L =
        typeof session.answers.levels === 'number'
          ? Math.max(0, Math.floor(session.answers.levels))
          : 0;
      const n = Math.max(0, L - 1);
      return {
        to: session.phone,
        text:
          `Espaçamentos *variáveis* entre eixos (mm) — *${n}* valor(es) para *${L}* níveis\n\n` +
            'Escreva na ordem (de baixo para cima), separados por vírgula. Cada valor é a distância *entre* dois eixos consecutivos de feixe.\n' +
            'Ex. com 4 níveis: 1000, 1200, 1500 (3 intervalos)\n' +
            'Cada intervalo: entre 800 e 5000 mm.',
      };
    }

    case 'CHOOSE_FIRST_LEVEL_GROUND':
      return {
        to: session.phone,
        text: 'O primeiro nível de feixe fica ao nível do piso?',
        buttons: [
          { id: 'FLG_SIM', label: 'Sim' },
          { id: 'FLG_NAO', label: 'Não' },
        ],
      };

    case 'CHOOSE_CAPACITY_MODE':
      return {
        to: session.phone,
        text:
          'Como pretende indicar a *capacidade por nível* (kg no feixe)?\n\n' +
            '• *Direto* — indica o valor em kg\n' +
            '• *Automático* — indica o peso do palete; calculamos: capacidade = 2× peso (2 baias por patamar)',
        buttons: [
          { id: 'CAP_MODE_DIRETO', label: 'Direto' },
          { id: 'CAP_MODE_AUTO', label: 'Automático' },
        ],
      };

    case 'WAIT_CAPACITY':
      return {
        to: session.phone,
        text: 'Capacidade por nível de feixe em kg\n\nExemplos: 1200, 1500 ou 2000',
      };

    case 'WAIT_PALLET_WEIGHT':
      return {
        to: session.phone,
        text:
          'Peso do palete com carga (kg)\n\n' +
            'A capacidade por nível será: *2×* este valor (2 baias por patamar).\n\n' +
            'Exemplo: 1000',
      };

    case 'WAIT_HEIGHT_DIRECT':
      return {
        to: session.phone,
        text: (() => {
          const bits: string[] = [];
          if (
            session.answers.capacityInputMode === 'AUTO' &&
            typeof session.answers.capacityKg === 'number'
          ) {
            bits.push(
              `Capacidade por nível já definida: *${session.answers.capacityKg}* kg (2× peso do palete).\n`
            );
          }
          bits.push(
            'Altura útil do sistema em mm (múltiplos de 80 mm — valores intermédios são alinhados automaticamente).\n\nExemplo: 5040'
          );
          return bits.join('\n');
        })(),
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
        text: `${prefix}*Proteções* (coluna e guardas em sequência)\n\nProtetor de coluna?`,
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

    case 'GENERATING_TUNNEL_PREVIEW':
      return {
        to: session.phone,
        text: GENERATING_TUNNEL_PREVIEW_WAIT_TEXT,
      };

    case 'WAIT_TUNNEL_MODULE_NUMBERS':
      return {
        to: session.phone,
        text:
          '📄 *Prévia com módulos numerados*\n\n' +
            'O PDF de pré-visualização (mesmo padrão de desenho, sem túneis) foi enviado em anexo.\n\n' +
            'Se *não vir o documento*, toque em *Baixar PDF* para o integrador reenviar o ficheiro.\n\n' +
            'Cada *número* na planta = *um módulo de frente* (2 baias), na mesma ordem usada no projeto final.\n\n' +
            '*Responda com os números* dos módulos onde pretende túnel. Exemplos: *2, 5, 8* ou *Módulos 2 e 6*.\n\n' +
            'Números inválidos serão sinalizados; repetições contam uma vez.\n\n' +
            'A seguir: *altura*, *carga* e *proteções* — igual ao modo assistente.',
        buttons: [{ id: 'BAIXAR_PREVIA_PDF', label: 'Baixar PDF' }],
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
    MELHOR_LAYOUT: 'Melhor layout (automático)',
    PERSONALIZADO: 'Personalizado',
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

  if (typeof a.tunnelInfoNote === 'string' && a.tunnelInfoNote.trim().length > 0) {
    lines.push(a.tunnelInfoNote.trim());
  }

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
    if (
      a.lineStrategy === 'PERSONALIZADO' &&
      typeof a.customLineSimpleCount === 'number' &&
      typeof a.customLineDoubleCount === 'number'
    ) {
      lines.push(
        `  • Simples: ${a.customLineSimpleCount} · duplas: ${a.customLineDoubleCount} (ordem: duplas → simples no eixo transversal)`
      );
    }
    const needsSpineLine =
      (a.lineStrategy === 'APENAS_DUPLOS' ||
        a.lineStrategy === 'MELHOR_LAYOUT' ||
        (a.lineStrategy === 'PERSONALIZADO' &&
          typeof a.customLineDoubleCount === 'number' &&
          a.customLineDoubleCount > 0)) &&
      typeof a.spineBackToBackMm === 'number';
    if (needsSpineLine) {
      lines.push(
        `Rua dupla (espinha / distanciador): ${a.spineBackToBackMm} mm`
      );
    }
  }
  /**
   * Túnel no resumo = layout calculado (módulo túnel real), não só `answers.hasTunnel`.
   */
  let tunnelForSummary: boolean | undefined =
    typeof a.hasTunnel === 'boolean' ? a.hasTunnel : undefined;
  let layoutForTunnel: LayoutSolutionV2 | null = null;
  const v2 = buildProjectAnswersV2(a);
  if (v2) {
    try {
      layoutForTunnel = buildLayoutSolutionV2(v2);
    } catch {
      layoutForTunnel = null;
    }
    if (layoutForTunnel) {
      const geo = buildLayoutGeometry(
        layoutForTunnel,
        a as Record<string, unknown>
      );
      tunnelForSummary = geo.metadata.hasTunnel;
    }
  }
  if (tunnelForSummary === true) {
    lines.push('Túnel para empilhador: Sim');
    if (
      Array.isArray(a.tunnelManualModuleIndices) &&
      a.tunnelManualModuleIndices.length > 0
    ) {
      const nums = (a.tunnelManualModuleIndices as number[]).join(', ');
      lines.push(`  • Definição: *manual* (módulos de frente com túnel: ${nums})`);
    }
    const effOff = layoutForTunnel?.metadata.tunnelOffsetEffectiveMm;
    const fromMeta = layoutForTunnel?.metadata.tunnelPlacements;
    const fromAns = Array.isArray(a.tunnelPlacements)
      ? (a.tunnelPlacements as unknown[]).filter(
          (x): x is string => typeof x === 'string'
        )
      : [];
    const posList =
      fromMeta && fromMeta.length > 0
        ? [...fromMeta]
        : fromAns.length > 0
          ? fromAns
          : a.tunnelPosition
            ? [String(a.tunnelPosition)]
            : [];
    if (posList.length > 1) {
      lines.push(
        `  • Posições (ordem): ${posList.map(p => posLabel(p)).join(' · ')}`
      );
    }
    if (typeof effOff === 'number') {
      lines.push(
        posList.length > 1
          ? `  • Início do 1.º vão (referência): ${effOff.toLocaleString('pt-BR')} mm`
          : `  • Início do vão ao longo da fileira: ${effOff.toLocaleString('pt-BR')} mm`
      );
    } else {
      if (posList.length === 1) {
        lines.push(`  • Posição: ${posLabel(posList[0])}`);
      } else if (posList.length > 1) {
        /* só lista de posições, sem offset derivado do layout */
      } else if (a.tunnelPosition) {
        lines.push(`  • Posição: ${posLabel(a.tunnelPosition)}`);
      }
    }
    if (a.tunnelAppliesTo) {
      lines.push(`  • Aplica-se a: ${tunnelAppliesLabel(a.tunnelAppliesTo)}`);
    }
  } else if (tunnelForSummary === false) {
    lines.push('Túnel para empilhador: Não');
  }

  if (a.moduleDimensionMode === 'PALLET') {
    lines.push('Dimensões de módulo: a partir de *medidas do palete*');
    if (typeof a.palletDepthMm === 'number' && typeof a.palletFrontMm === 'number') {
      lines.push(
        `  • Palete: profundidade ${a.palletDepthMm} mm · frente ${a.palletFrontMm} mm`
      );
    }
  } else if (a.moduleDimensionMode === 'MANUAL') {
    lines.push('Dimensões de módulo: *entrada manual* (montante e vão)');
  }
  if (typeof a.moduleDepthMm === 'number') {
    lines.push(`Profundidade de posição (resultado, montante): ${a.moduleDepthMm} mm`);
  }
  if (typeof a.beamLengthMm === 'number') {
    lines.push(
      `Vão por baia / entrada longarina (resultado): ${a.beamLengthMm} mm`
    );
  }
  if (typeof a.levels === 'number') {
    lines.push(`Níveis por módulo: ${a.levels}`);
  }
  if (a.equalLevelSpacing === true && typeof a.levelSpacingMm === 'number') {
    lines.push(
      `Espaçamento entre eixos de feixe: *igual* — ${a.levelSpacingMm} mm (em todos os intervalos)`
    );
  } else if (
    Array.isArray(a.levelSpacingsMm) &&
    a.levelSpacingsMm.length > 0
  ) {
    lines.push(
      `Espaçamento entre eixos (variável, mm, de baixo para cima): ${(a.levelSpacingsMm as number[]).join(' · ')}`
    );
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
    if (
      a.capacityInputMode === 'AUTO' &&
      typeof a.palletWeightKg === 'number'
    ) {
      lines.push(
        `Capacidade por nível: ${a.capacityKg} kg (automático: palete ${a.palletWeightKg} kg × 2)`
      );
    } else {
      lines.push(`Capacidade por nível: ${a.capacityKg} kg`);
    }
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
      'Altura do módulo e níveis calculados automaticamente (máx. níveis, passo 80 mm; folga superior ao último patamar típica ~300 mm no modelo).'
    );
  }

  if (typeof a.columnProtector === 'boolean') {
    lines.push(`Protetores de coluna: ${a.columnProtector ? 'Sim' : 'Não'}`);
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
    lines.push(
      `Módulos: ${formatModuleSpanCountsCommercialPt(budget.totals.segmentCounts)}`
    );
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
