import { transition, Input } from './stateMachine';
import { Session } from './session';
import { finalizeSummaryAnswers } from './projectEngines';

const createSession = (
  state: string,
  answers: Record<string, unknown> = {},
  stack: string[] = [],
  editStopBefore?: string
): Session => {
  return {
    phone: '5511999999999',
    state,
    answers,
    stack,
    updatedAt: Date.now(),
    editStopBefore,
  };
};

describe('State Machine - Edit Flow', () => {
  describe('Edit from FINAL_CONFIRM', () => {
    it('should go to CHOOSE_EDIT_FIELD when clicking Editar', () => {
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
          heightMm: 5040,
          levels: 4,
          guardRailSimple: false,
          guardRailDouble: false,
        })
      );
      const input: Input = { type: 'BUTTON', value: 'EDITAR' };

      const result = transition(session, input);

      expect(result.session.state).toBe('CHOOSE_EDIT_FIELD');
      expect(result.session.stack).toContain('FINAL_CONFIRM');
    });

    it('should go to WAIT_CORRIDOR when choosing EDIT_LAYOUT', () => {
      const session = createSession(
        'CHOOSE_EDIT_FIELD',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5040,
          levels: 4,
        }),
        ['FINAL_CONFIRM']
      );
      const input: Input = { type: 'BUTTON', value: 'EDIT_LAYOUT' };

      const result = transition(session, input);

      expect(result.session.state).toBe('WAIT_CORRIDOR');
      expect(result.session.editStopBefore).toBe('WAIT_MODULE_DEPTH');
      expect(result.session.stack).toContain('CHOOSE_EDIT_FIELD');
    });

    it('should return to SUMMARY_CONFIRM after completing layout edit (tunnel no)', () => {
      const session = createSession(
        'CHOOSE_TUNNEL',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5040,
          levels: 4,
        }),
        ['FINAL_CONFIRM', 'CHOOSE_EDIT_FIELD'],
        'WAIT_MODULE_DEPTH'
      );

      const result = transition(session, {
        type: 'BUTTON',
        value: 'TUNNEL_NAO',
      });

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.editStopBefore).toBeUndefined();
    });

    it('should go to WAIT_LENGTH when choosing EDIT_MEDIDAS', () => {
      const session = createSession(
        'CHOOSE_EDIT_FIELD',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          levels: 4,
        }),
        ['FINAL_CONFIRM']
      );
      const input: Input = { type: 'BUTTON', value: 'EDIT_MEDIDAS' };

      const result = transition(session, input);

      expect(result.session.state).toBe('WAIT_LENGTH');
      expect(result.session.editStopBefore).toBe('WAIT_CORRIDOR');
    });

    it('should return to SUMMARY_CONFIRM after editing medidas (length then width)', () => {
      let session = createSession(
        'WAIT_LENGTH',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          levels: 4,
        }),
        ['FINAL_CONFIRM', 'CHOOSE_EDIT_FIELD'],
        'WAIT_CORRIDOR'
      );

      let result = transition(session, { type: 'TEXT', value: '13000' });
      expect(result.session.state).toBe('WAIT_WIDTH');
      session = result.session;

      result = transition(session, { type: 'TEXT', value: '10000' });
      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.lengthMm).toBe(13000);
    });

    it('should go back when clicking VOLTAR_RESUMO', () => {
      const session = createSession('CHOOSE_EDIT_FIELD', { lengthMm: 12000 }, [
        'FINAL_CONFIRM',
      ]);
      const input: Input = { type: 'BUTTON', value: 'VOLTAR_RESUMO' };

      const result = transition(session, input);

      expect(result.session.state).toBe('FINAL_CONFIRM');
      expect(result.session.stack).toEqual([]);
    });

    it('should go to CHOOSE_COLUMN_PROTECTOR when choosing EDIT_PROTECOES', () => {
      const session = createSession(
        'CHOOSE_EDIT_FIELD',
        finalizeSummaryAnswers({
          lengthMm: 12000,
          widthMm: 10000,
          corridorMm: 3000,
          moduleDepthMm: 2700,
          beamLengthMm: 1100,
          capacityKg: 2000,
          heightMode: 'DIRECT',
          heightMm: 5040,
          levels: 4,
        }),
        ['FINAL_CONFIRM']
      );
      const result = transition(session, {
        type: 'BUTTON',
        value: 'EDIT_PROTECOES',
      });

      expect(result.session.state).toBe('CHOOSE_COLUMN_PROTECTOR');
      expect(result.session.editStopBefore).toBe('SUMMARY_CONFIRM');
    });
  });
});
