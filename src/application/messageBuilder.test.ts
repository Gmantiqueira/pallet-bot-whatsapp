import { buildMessages } from './messageBuilder';
import { Session } from '../domain/session';
import { finalizeSummaryAnswers } from '../domain/projectEngines';

const createSession = (
  state: string,
  answers: Record<string, unknown> = {}
): Session => {
  return {
    phone: '5511999999999',
    state,
    answers,
    stack: [],
    updatedAt: Date.now(),
  };
};

describe('MessageBuilder', () => {
  describe('MENU state', () => {
    it('should build MENU message with correct text and buttons', () => {
      const session = createSession('MENU');
      const messages = buildMessages(session);

      expect(messages).toHaveLength(1);
      expect(messages[0].to).toBe(session.phone);
      expect(messages[0].text).toContain('NOVO PROJETO');
      expect(messages[0].text).toContain('1️⃣ Planta real');
      expect(messages[0].text).toContain('2️⃣ Medidas digitadas');
      expect(messages[0].buttons).toHaveLength(2);
      expect(messages[0].buttons?.[0]).toEqual({ id: '1', label: 'PLANTA' });
      expect(messages[0].buttons?.[1]).toEqual({ id: '2', label: 'MEDIDAS' });
    });
  });

  describe('Error handling', () => {
    it('should include error message when lastError is provided', () => {
      const session = createSession('WAIT_LENGTH');
      const messages = buildMessages(session, { lastError: 'Valor inválido' });

      expect(messages).toHaveLength(2);
      expect(messages[0].text).toContain('❌');
      expect(messages[0].text).toContain('Valor inválido');
    });
  });

  describe('Status only', () => {
    it('should return only summary when statusOnly is true', () => {
      const session = createSession('WAIT_CORRIDOR', {
        lengthMm: 12000,
        widthMm: 10000,
      });
      const messages = buildMessages(session, { statusOnly: true });

      expect(messages).toHaveLength(1);
      expect(messages[0].text).toContain('RESUMO');
      expect(messages[0].text).toContain('12000');
      expect(messages[0].text).toContain('10000');
    });
  });

  describe('Image analyzed', () => {
    it('should include image analyzed message when imageAnalyzed is true', () => {
      const session = createSession('WAIT_CORRIDOR', {
        lengthMm: 12000,
        widthMm: 10000,
      });
      const messages = buildMessages(session, {
        imageAnalyzed: true,
        previousState: 'WAIT_PLANT_IMAGE',
      });

      expect(messages.length).toBeGreaterThan(1);
      const imageMessage = messages.find(m =>
        m.text?.includes('Imagem recebida')
      );
      expect(imageMessage).toBeDefined();
      expect(imageMessage?.text).toContain('12000');
      expect(imageMessage?.text).toContain('10000');
    });
  });

  describe('State messages', () => {
    it('should build START message', () => {
      const session = createSession('START');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('Olá!');
      expect(messages[0].text).toMatch(/qualquer coisa|iniciar/i);
    });

    it('should build WAIT_PLANT_IMAGE message', () => {
      const session = createSession('WAIT_PLANT_IMAGE');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('foto');
      expect(messages[0].text).toContain('medidas devem estar visíveis');
    });

    it('should build WAIT_LENGTH message with example', () => {
      const session = createSession('WAIT_LENGTH');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('comprimento');
      expect(messages[0].text).toContain('12000');
    });

    it('should build WAIT_CORRIDOR message with examples and Sem corredor', () => {
      const session = createSession('WAIT_CORRIDOR');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('corredor principal');
      expect(messages[0].text).toContain('2800');
      expect(messages[0].text).toContain('3000');
      expect(messages[0].text).toContain('500');
      expect(messages[0].buttons?.map(b => b.id)).toEqual(['SEM_CORREDOR']);
    });

    it('should build WAIT_HEIGHT_DIRECT message', () => {
      const session = createSession('WAIT_HEIGHT_DIRECT');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('Altura útil do sistema');
      expect(messages[0].text).toContain('5040');
    });

    it('should build CHOOSE_GUARD_RAIL_SIMPLE message with buttons', () => {
      const session = createSession('CHOOSE_GUARD_RAIL_SIMPLE');
      const messages = buildMessages(session);

      expect(messages[0].buttons).toHaveLength(2);
      expect(messages[0].buttons?.map(b => b.id)).toEqual([
        'GRS_SIM',
        'GRS_NAO',
      ]);
    });

    it('should build SUMMARY_CONFIRM message with summary and buttons', () => {
      const session = createSession(
        'SUMMARY_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 800,
          heightMode: 'DIRECT',
          heightMm: 5040,
          levels: 4,
          hasGroundLevel: false,
          guardRailSimple: true,
          guardRailSimplePosition: 'AMBOS',
          guardRailDouble: false,
        })
      );
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('RESUMO');
      expect(messages[0].text).toContain('12000');
      expect(messages[0].text).toContain('10000');
      expect(messages[0].text).toContain('3000');
      expect(messages[0].text).toContain('800');
      expect(messages[0].text).toContain('5040');
      expect(messages[0].text).toContain('Altura útil do sistema');
      expect(messages[0].text).toContain('Profundidade de posição (resultado, montante)');
      expect(messages[0].text).toContain('Vão por baia / entrada longarina (resultado): 1100');
      expect(messages[0].text).toContain('Níveis por módulo: 4');
      expect(messages[0].text).toContain('Ambos');
      expect(messages[0].text).toContain('Módulos: 9');
      expect(messages[0].text).toContain('Posições: 72');
      expect(messages[0].text).toContain('Coluna selecionada: 8T');
      expect(messages[0].text).toContain('Pares de longarinas: 72');
      expect(messages[0].buttons).toHaveLength(1);
      expect(messages[0].buttons?.[0].id).toBe('CONTINUAR');
    });

    it('should build DONE com botão Baixar PDF (integrador envia PDF)', () => {
      const session = createSession('DONE');
      const messages = buildMessages(session, {
        pdfFilename: 'projeto-1730000000000.pdf',
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('text');
      expect(messages[0].text).toContain('Projeto gerado com sucesso');
      expect(messages[0].text).toContain('integrador interno');
      expect(messages[0].buttons).toEqual([
        { id: 'BAIXAR_PDF', label: 'Baixar PDF' },
        { id: 'GERAR_ORCAMENTO', label: 'Gerar orçamento' },
      ]);
      expect(messages.some(m => m.type === 'document')).toBe(false);
    });

    it('should use pdfFilename from session answers when ctx omits it', () => {
      const session = createSession('DONE', {
        pdfFilename: 'projeto-from-session.pdf',
      });
      const messages = buildMessages(session, {});

      expect(messages).toHaveLength(1);
      expect(messages[0].text).toContain('integrador interno');
      expect(messages.some(m => m.type === 'document')).toBe(false);
    });

    it('DONE without pdfFilename should not fabricate document link', () => {
      const session = createSession('DONE', {});
      const messages = buildMessages(session, {});

      expect(messages.some(m => m.type === 'document')).toBe(false);
      expect(messages[0].text).toContain('Gerar projeto');
    });
  });
});
