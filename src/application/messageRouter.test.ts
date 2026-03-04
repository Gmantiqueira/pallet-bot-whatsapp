import { routeIncoming, IncomingPayload } from './messageRouter';
import { Session } from '../domain/session';
import { SessionRepository } from '../domain/sessionRepository';

const createSession = (state: string, answers: Record<string, unknown> = {}): Session => {
  return {
    phone: '5511999999999',
    state,
    answers,
    stack: [],
    updatedAt: Date.now(),
  };
};

class MockSessionRepository implements SessionRepository {
  private sessions: Map<string, Session> = new Map();

  get(phone: string): Session | null {
    return this.sessions.get(phone) || null;
  }

  upsert(session: Session): void {
    this.sessions.set(session.phone, { ...session });
  }

  reset(phone: string): void {
    this.sessions.delete(phone);
  }
}

describe('MessageRouter', () => {
  let repository: MockSessionRepository;

  beforeEach(() => {
    repository = new MockSessionRepository();
  });

  describe('Input conversion', () => {
    it('should convert text with global command to GLOBAL input', () => {
      const session = createSession('WAIT_LENGTH');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: 'novo',
      };

      const result = routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('MENU');
      expect(result.session.answers).toEqual({});
    });

    it('should convert buttonReply to BUTTON input', () => {
      const session = createSession('MENU');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: '2',
      };

      const result = routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_LENGTH');
    });

    it('should convert media image to MEDIA_IMAGE input', () => {
      const session = createSession('WAIT_PLANT_IMAGE');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        media: {
          type: 'image',
          id: 'image_123',
        },
      };

      const result = routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_CORRIDOR');
    });

    it('should convert text to TEXT input', () => {
      const session = createSession('WAIT_LENGTH');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: '12000',
      };

      const result = routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_WIDTH');
      expect(result.session.answers.lengthMm).toBe(12000);
    });
  });

  describe('Error handling', () => {
    it('should not advance state when validation error occurs', () => {
      const session = createSession('WAIT_LENGTH');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: '400', // Too small
      };

      const result = routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_LENGTH');
      expect(result.outgoingMessages[0].text).toContain('❌');
      expect(result.outgoingMessages[0].text).toContain('500');
    });
  });

  describe('Status command', () => {
    it('should return status without changing state', () => {
      const session = createSession('WAIT_CORRIDOR', {
        lengthMm: 12000,
        widthMm: 10000,
      });
      const incoming: IncomingPayload = {
        from: '5511999999999',
        text: 'status',
      };

      const result = routeIncoming(session, incoming, repository);

      expect(result.session.state).toBe('WAIT_CORRIDOR');
      expect(result.outgoingMessages[0].text).toContain('RESUMO');
      expect(result.outgoingMessages[0].text).toContain('12000');
    });
  });

  describe('Session persistence', () => {
    it('should persist session after routing', () => {
      const session = createSession('MENU');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        buttonReply: '2',
      };

      routeIncoming(session, incoming, repository);

      const persisted = repository.get('5511999999999');
      expect(persisted).not.toBeNull();
      expect(persisted?.state).toBe('WAIT_LENGTH');
    });
  });

  describe('Image analysis detection', () => {
    it('should detect image analysis when transitioning from WAIT_PLANT_IMAGE', () => {
      const session = createSession('WAIT_PLANT_IMAGE');
      const incoming: IncomingPayload = {
        from: '5511999999999',
        media: {
          type: 'image',
          id: 'image_123',
        },
      };

      const result = routeIncoming(session, incoming, repository);

      // Should have image analyzed message
      const imageMessage = result.outgoingMessages.find((m) =>
        m.text?.includes('IMAGEM ANALISADA')
      );
      expect(imageMessage).toBeDefined();
    });
  });
});
