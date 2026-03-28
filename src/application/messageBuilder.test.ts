import { buildMessages } from './messageBuilder';
import { Session } from '../domain/session';
import { finalizeSummaryAnswers } from '../domain/projectEngines';

const createSession = (state: string, answers: Record<string, unknown> = {}): Session => {
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
      expect(messages[0].text).toContain('3️⃣ Galpão fictício');
      expect(messages[0].buttons).toHaveLength(3);
      expect(messages[0].buttons?.[0]).toEqual({ id: '1', label: 'PLANTA' });
      expect(messages[0].buttons?.[1]).toEqual({ id: '2', label: 'MEDIDAS' });
      expect(messages[0].buttons?.[2]).toEqual({ id: '3', label: 'FICTICIO' });
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
      const imageMessage = messages.find((m) => m.text?.includes('IMAGEM ANALISADA'));
      expect(imageMessage).toBeDefined();
      expect(imageMessage?.text).toContain('12000');
      expect(imageMessage?.text).toContain('10000');
    });
  });

  describe('State messages', () => {
    it('should build START message', () => {
      const session = createSession('START');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('novo');
    });

    it('should build WAIT_PLANT_IMAGE message', () => {
      const session = createSession('WAIT_PLANT_IMAGE');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('Envie uma imagem');
      expect(messages[0].text).toContain('medidas precisam estar visíveis');
    });

    it('should build WAIT_LENGTH message with example', () => {
      const session = createSession('WAIT_LENGTH');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('comprimento');
      expect(messages[0].text).toContain('12000');
    });

    it('should build WAIT_CORRIDOR message with examples', () => {
      const session = createSession('WAIT_CORRIDOR');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('corredor');
      expect(messages[0].text).toContain('2800');
      expect(messages[0].text).toContain('2000');
    });

    it('should build CHOOSE_HEIGHT_MODE message with buttons', () => {
      const session = createSession('CHOOSE_HEIGHT_MODE');
      const messages = buildMessages(session);

      expect(messages[0].buttons).toHaveLength(2);
      expect(messages[0].buttons?.[0].id).toBe('DIRECT');
      expect(messages[0].buttons?.[0].label).toBe('Digitar altura');
      expect(messages[0].buttons?.[1].id).toBe('CALC');
      expect(messages[0].buttons?.[1].label).toBe('Calcular pela carga');
    });

    it('should build WAIT_EXTRAS_GUARD_RAIL message with buttons', () => {
      const session = createSession('WAIT_EXTRAS_GUARD_RAIL');
      const messages = buildMessages(session);

      expect(messages[0].buttons).toHaveLength(4);
      expect(messages[0].buttons?.map((b) => b.id)).toEqual(['inicio', 'final', 'ambos', 'nao']);
    });

    it('should build SUMMARY_CONFIRM message with summary and buttons', () => {
      const session = createSession(
        'SUMMARY_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRail: 'ambos',
        }),
      );
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('RESUMO');
      expect(messages[0].text).toContain('12000');
      expect(messages[0].text).toContain('10000');
      expect(messages[0].text).toContain('3000');
      expect(messages[0].text).toContain('2000');
      expect(messages[0].text).toContain('5000');
      expect(messages[0].text).toContain('Níveis: 4');
      expect(messages[0].text).toContain('Ambos');
      expect(messages[0].text).toContain('Módulos: 10');
      expect(messages[0].text).toContain('Posições: 40');
      expect(messages[0].text).toContain('Tipo de montante: Montante 8T');
      expect(messages[0].text).toContain('Pares de longarinas: 40');
      expect(messages[0].buttons).toHaveLength(2);
      expect(messages[0].buttons?.[0].id).toBe('GERAR');
      expect(messages[0].buttons?.[1].id).toBe('EDITAR');
    });

    it('should build DONE message with document', () => {
      const session = createSession('DONE');
      const messages = buildMessages(session);

      expect(messages[0].text).toContain('Projeto concluído');
      expect(messages[0].document).toBeDefined();
      expect(messages[0].document?.filename).toContain('.pdf');
      expect(messages[0].document?.url).toBeDefined();
    });
  });
});
