import { transition, Input } from './stateMachine';
import { Session } from './session';
import { finalizeSummaryAnswers } from './projectEngines';

const createSession = (state: string, answers: Record<string, unknown> = {}, stack: string[] = []): Session => {
  return {
    phone: '5511999999999',
    state,
    answers,
    stack,
    updatedAt: Date.now(),
  };
};

describe('State Machine', () => {
  describe('Global commands', () => {
    it('should handle "novo" command and go to MENU', () => {
      const session = createSession('WAIT_LENGTH', { lengthMm: 1000 });
      const input: Input = { type: 'GLOBAL', command: 'novo' };

      const result = transition(session, input);

      expect(result.session.state).toBe('MENU');
      expect(result.session.answers).toEqual({});
      expect(result.session.stack).toEqual([]);
      expect(result.effects).toContainEqual({ type: 'SEND' });
      expect(result.error).toBeUndefined();
    });

    it('should handle "cancelar" command and go to MENU', () => {
      const session = createSession('WAIT_WIDTH', { lengthMm: 1000 });
      const input: Input = { type: 'GLOBAL', command: 'cancelar' };

      const result = transition(session, input);

      expect(result.session.state).toBe('MENU');
      expect(result.session.answers).toEqual({});
      expect(result.session.stack).toEqual([]);
      expect(result.effects).toContainEqual({ type: 'SEND' });
    });

    it('should handle "voltar" command and return to previous state', () => {
      const session = createSession('WAIT_WIDTH', { lengthMm: 1000 }, ['MENU', 'WAIT_LENGTH']);
      const input: Input = { type: 'GLOBAL', command: 'voltar' };

      const result = transition(session, input);

      expect(result.session.state).toBe('WAIT_LENGTH');
      expect(result.session.stack).toEqual(['MENU']);
      expect(result.session.answers).toEqual({ lengthMm: 1000 }); // Answers preserved
      expect(result.effects).toContainEqual({ type: 'SEND' });
    });

    it('should handle "voltar" with 2 steps back', () => {
      const session = createSession('WAIT_CORRIDOR', { lengthMm: 1000, widthMm: 2000 }, [
        'MENU',
        'WAIT_LENGTH',
        'WAIT_WIDTH',
      ]);
      const input: Input = { type: 'GLOBAL', command: 'voltar' };

      const result1 = transition(session, input);
      expect(result1.session.state).toBe('WAIT_WIDTH');
      expect(result1.session.stack).toEqual(['MENU', 'WAIT_LENGTH']);

      const result2 = transition(result1.session, input);
      expect(result2.session.state).toBe('WAIT_LENGTH');
      expect(result2.session.stack).toEqual(['MENU']);
    });

    it('should handle "status" command without changing state', () => {
      const session = createSession('WAIT_LENGTH', { lengthMm: 1000 });
      const input: Input = { type: 'GLOBAL', command: 'status' };

      const result = transition(session, input);

      expect(result.session.state).toBe('WAIT_LENGTH');
      expect(result.session.answers).toEqual({ lengthMm: 1000 });
      expect(result.effects).toContainEqual({ type: 'SEND' });
    });
  });

  describe('Flow: measures typed path to SUMMARY_CONFIRM', () => {
    it('should complete full flow from MENU to SUMMARY_CONFIRM', () => {
      let session = createSession('MENU');

      let result = transition(session, { type: 'BUTTON', value: '2' });
      expect(result.session.state).toBe('WAIT_LENGTH');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '12000' });
      expect(result.session.state).toBe('WAIT_WIDTH');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '10000' });
      expect(result.session.state).toBe('WAIT_CORRIDOR');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '3000' });
      expect(result.session.state).toBe('CHOOSE_MODULE_ORIENTATION');
      expect(result.session.answers.corridorMm).toBe(3000);
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'ORIENT_H' });
      expect(result.session.state).toBe('CHOOSE_LINE_STRATEGY');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'LINE_SIMPLES' });
      expect(result.session.state).toBe('CHOOSE_TUNNEL');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'TUNNEL_NAO' });
      expect(result.session.state).toBe('WAIT_MODULE_DEPTH');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '2700' });
      expect(result.session.state).toBe('WAIT_BEAM_LENGTH');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '1100' });
      expect(result.session.state).toBe('WAIT_LEVELS');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '4' });
      expect(result.session.state).toBe('CHOOSE_FIRST_LEVEL_GROUND');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'FLG_SIM' });
      expect(result.session.state).toBe('CHOOSE_EQUAL_LEVEL_SPACING');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'ELS_SIM' });
      expect(result.session.state).toBe('WAIT_LEVEL_SPACING_SINGLE');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '1600' });
      expect(result.session.state).toBe('WAIT_CAPACITY');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '2000' });
      expect(result.session.state).toBe('CHOOSE_HEIGHT_MODE');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'DIRECT' });
      expect(result.session.state).toBe('WAIT_HEIGHT_DIRECT');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '5000' });
      expect(result.session.state).toBe('CHOOSE_COLUMN_PROTECTOR');
      expect(result.session.answers.heightMm).toBe(5000);
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'COL_NAO' });
      expect(result.session.state).toBe('CHOOSE_GUARD_RAIL_SIMPLE');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'GRS_NAO' });
      expect(result.session.state).toBe('CHOOSE_GUARD_RAIL_DOUBLE');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'GRD_NAO' });
      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.layout).toBeDefined();
      expect(result.session.answers.structure).toBeDefined();
      expect(result.session.answers.budget).toBeDefined();
      expect((result.session.answers.budget as { totals: { modules: number } }).totals.modules).toBe(10);
    });

    it('should complete flow with CALC height mode after capacity', () => {
      let session = createSession('CHOOSE_HEIGHT_MODE', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      });

      let result = transition(session, { type: 'BUTTON', value: 'CALC' });
      expect(result.session.state).toBe('WAIT_LOAD_HEIGHT');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '1500' });
      expect(result.session.state).toBe('CHOOSE_COLUMN_PROTECTOR');
      expect(result.session.answers.loadHeightMm).toBe(1500);
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'COL_NAO' });
      expect(result.session.state).toBe('CHOOSE_GUARD_RAIL_SIMPLE');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'GRS_NAO' });
      expect(result.session.state).toBe('CHOOSE_GUARD_RAIL_DOUBLE');
      session = result.session;

      result = transition(session, { type: 'BUTTON', value: 'GRD_NAO' });
      expect(result.session.state).toBe('SUMMARY_CONFIRM');
    });
  });

  describe('Validations', () => {
    it('should reject length below minimum', () => {
      const session = createSession('WAIT_LENGTH');
      const input: Input = { type: 'TEXT', value: '400' };

      const result = transition(session, input);

      expect(result.error).toContain('500');
      expect(result.session.state).toBe('WAIT_LENGTH');
    });

    it('should reject length above maximum', () => {
      const session = createSession('WAIT_LENGTH');
      const input: Input = { type: 'TEXT', value: '250000' };

      const result = transition(session, input);

      expect(result.error).toContain('200000');
      expect(result.session.state).toBe('WAIT_LENGTH');
    });

    it('should reject corridor below minimum', () => {
      const session = createSession('WAIT_CORRIDOR', { lengthMm: 12000, widthMm: 10000 });
      const input: Input = { type: 'TEXT', value: '500' };

      const result = transition(session, input);

      expect(result.error).toContain('1000');
      expect(result.session.state).toBe('WAIT_CORRIDOR');
    });

    it('should reject corridor above maximum', () => {
      const session = createSession('WAIT_CORRIDOR', { lengthMm: 12000, widthMm: 10000 });
      const input: Input = { type: 'TEXT', value: '7000' };

      const result = transition(session, input);

      expect(result.error).toContain('6000');
      expect(result.session.state).toBe('WAIT_CORRIDOR');
    });

    it('should reject capacity below minimum', () => {
      const session = createSession('WAIT_CAPACITY', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
      });
      const input: Input = { type: 'TEXT', value: '50' };

      const result = transition(session, input);

      expect(result.error).toContain('100');
      expect(result.session.state).toBe('WAIT_CAPACITY');
    });

    it('should reject capacity above maximum', () => {
      const session = createSession('WAIT_CAPACITY', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
      });
      const input: Input = { type: 'TEXT', value: '6000' };

      const result = transition(session, input);

      expect(result.error).toContain('5000');
      expect(result.session.state).toBe('WAIT_CAPACITY');
    });

    it('should reject levels below minimum', () => {
      const session = createSession('WAIT_LEVELS', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'CALC',
        loadHeightMm: 1500,
      });
      const input: Input = { type: 'TEXT', value: '0' };

      const result = transition(session, input);

      expect(result.error).toContain('1');
      expect(result.session.state).toBe('WAIT_LEVELS');
    });

    it('should reject levels above maximum', () => {
      const session = createSession('WAIT_LEVELS', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'CALC',
        loadHeightMm: 1500,
      });
      const input: Input = { type: 'TEXT', value: '15' };

      const result = transition(session, input);

      expect(result.error).toContain('12');
      expect(result.session.state).toBe('WAIT_LEVELS');
    });

    it('should reject invalid number format', () => {
      const session = createSession('WAIT_LENGTH');
      const input: Input = { type: 'TEXT', value: 'abc' };

      const result = transition(session, input);

      expect(result.error).toContain('número válido');
      expect(result.session.state).toBe('WAIT_LENGTH');
    });
  });

  describe('Stack management', () => {
    it('should push current state to stack when advancing', () => {
      const session = createSession('MENU');
      const result = transition(session, { type: 'BUTTON', value: '2' });

      expect(result.session.stack).toContain('MENU');
      expect(result.session.state).toBe('WAIT_LENGTH');
    });

    it('should preserve answers when going back', () => {
      const session = createSession('WAIT_WIDTH', { lengthMm: 12000 }, ['MENU', 'WAIT_LENGTH']);
      const result = transition(session, { type: 'GLOBAL', command: 'voltar' });

      expect(result.session.state).toBe('WAIT_LENGTH');
      expect(result.session.answers.lengthMm).toBe(12000);
    });
  });

  describe('GENERATE_PDF effect', () => {
    it('should generate GENERATE_PDF effect when confirming on FINAL_CONFIRM', () => {
      const session = createSession(
        'FINAL_CONFIRM',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5000,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );

      const result = transition(session, { type: 'BUTTON', value: 'GERAR' });

      expect(result.session.state).toBe('GENERATING_DOC');
      expect(result.effects).toContainEqual({ type: 'GENERATE_PDF' });
      expect(result.effects).toContainEqual({ type: 'SEND' });
    });
  });
});
