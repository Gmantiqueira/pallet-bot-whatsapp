import { transition, Input } from './stateMachine';
import { Session } from './session';

const createSession = (
  state: string,
  answers: Record<string, unknown> = {},
  stack: string[] = []
): Session => {
  return {
    phone: '5511999999999',
    state,
    answers,
    stack,
    updatedAt: Date.now(),
  };
};

describe('State Machine - Edit Flow', () => {
  describe('Edit from SUMMARY_CONFIRM', () => {
    it('should go to CHOOSE_EDIT_FIELD when clicking Editar', () => {
      const session = createSession('SUMMARY_CONFIRM', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'DIRECT',
        heightMm: 5000,
        guardRail: 'ambos',
      });
      const input: Input = { type: 'BUTTON', value: 'EDITAR' };

      const result = transition(session, input);

      expect(result.session.state).toBe('CHOOSE_EDIT_FIELD');
      expect(result.session.stack).toContain('SUMMARY_CONFIRM');
    });

    it('should go to WAIT_CORRIDOR when choosing CORREDOR to edit', () => {
      const session = createSession('CHOOSE_EDIT_FIELD', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      }, ['SUMMARY_CONFIRM']);
      const input: Input = { type: 'BUTTON', value: 'CORREDOR' };

      const result = transition(session, input);

      expect(result.session.state).toBe('WAIT_CORRIDOR');
      expect(result.session.stack).toContain('CHOOSE_EDIT_FIELD');
    });

    it('should return to SUMMARY_CONFIRM after editing corridor', () => {
      const session = createSession('WAIT_CORRIDOR', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      }, ['SUMMARY_CONFIRM', 'CHOOSE_EDIT_FIELD']);
      const input: Input = { type: 'TEXT', value: '3500' };

      const result = transition(session, input);

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.corridorMm).toBe(3500);
      expect(result.session.stack).not.toContain('CHOOSE_EDIT_FIELD');
    });

    it('should return to SUMMARY_CONFIRM after editing capacity', () => {
      const session = createSession('WAIT_CAPACITY', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      }, ['SUMMARY_CONFIRM', 'CHOOSE_EDIT_FIELD']);
      const input: Input = { type: 'TEXT', value: '2500' };

      const result = transition(session, input);

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.capacityKg).toBe(2500);
    });

    it('should return to SUMMARY_CONFIRM after editing guard rail', () => {
      const session = createSession('WAIT_EXTRAS_GUARD_RAIL', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        guardRail: 'ambos',
      }, ['SUMMARY_CONFIRM', 'CHOOSE_EDIT_FIELD']);
      const input: Input = { type: 'BUTTON', value: 'inicio' };

      const result = transition(session, input);

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.guardRail).toBe('inicio');
    });

    it('should go back to SUMMARY_CONFIRM when clicking VOLTAR_RESUMO', () => {
      const session = createSession('CHOOSE_EDIT_FIELD', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      }, ['SUMMARY_CONFIRM']);
      const input: Input = { type: 'BUTTON', value: 'VOLTAR_RESUMO' };

      const result = transition(session, input);

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.stack).toEqual([]);
    });

    it('should go to WAIT_LENGTH when choosing MEDIDAS to edit', () => {
      const session = createSession('CHOOSE_EDIT_FIELD', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      }, ['SUMMARY_CONFIRM']);
      const input: Input = { type: 'BUTTON', value: 'MEDIDAS' };

      const result = transition(session, input);

      expect(result.session.state).toBe('WAIT_LENGTH');
    });

    it('should return to SUMMARY_CONFIRM after editing length (from edit mode)', () => {
      const session = createSession('WAIT_LENGTH', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
      }, ['SUMMARY_CONFIRM', 'CHOOSE_EDIT_FIELD']);
      const input: Input = { type: 'TEXT', value: '13000' };

      const result = transition(session, input);

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.lengthMm).toBe(13000);
    });

    it('should go to CHOOSE_HEIGHT_MODE when choosing ALTURA to edit', () => {
      const session = createSession('CHOOSE_EDIT_FIELD', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'DIRECT',
        heightMm: 5000,
      }, ['SUMMARY_CONFIRM']);
      const input: Input = { type: 'BUTTON', value: 'ALTURA' };

      const result = transition(session, input);

      expect(result.session.state).toBe('CHOOSE_HEIGHT_MODE');
    });

    it('should return to SUMMARY_CONFIRM after editing height (DIRECT mode)', () => {
      const session = createSession('WAIT_HEIGHT_DIRECT', {
        lengthMm: 12000,
        widthMm: 10000,
        corridorMm: 3000,
        capacityKg: 2000,
        heightMode: 'DIRECT',
        heightMm: 5000,
      }, ['SUMMARY_CONFIRM', 'CHOOSE_EDIT_FIELD', 'CHOOSE_HEIGHT_MODE']);
      const input: Input = { type: 'TEXT', value: '6000' };

      const result = transition(session, input);

      expect(result.session.state).toBe('SUMMARY_CONFIRM');
      expect(result.session.answers.heightMm).toBe(6000);
    });
  });
});
