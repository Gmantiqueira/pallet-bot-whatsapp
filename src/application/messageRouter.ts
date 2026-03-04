import { Session } from '../domain/session';
import { SessionRepository } from '../domain/sessionRepository';
import { Input, transition, State } from '../domain/stateMachine';
import { OutgoingMessage } from '../types/messages';
import { buildMessages, MessageContext } from './messageBuilder';

export interface IncomingPayload {
  from: string;
  text?: string;
  buttonReply?: string;
  media?: {
    type: 'image';
    id: string;
  };
}

export interface RouterResult {
  session: Session;
  outgoingMessages: OutgoingMessage[];
}

const GLOBAL_COMMANDS = ['novo', 'voltar', 'cancelar', 'status'];

const isGlobalCommand = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  return GLOBAL_COMMANDS.includes(normalized);
};

const convertToInput = (incoming: IncomingPayload): Input | null => {
  // Check for global command in text
  if (incoming.text && isGlobalCommand(incoming.text)) {
    return {
      type: 'GLOBAL',
      command: incoming.text.trim().toLowerCase() as 'novo' | 'voltar' | 'cancelar' | 'status',
    };
  }

  // Check for button reply
  if (incoming.buttonReply) {
    return {
      type: 'BUTTON',
      value: incoming.buttonReply,
    };
  }

  // Check for media image
  if (incoming.media?.type === 'image') {
    return {
      type: 'MEDIA_IMAGE',
      id: incoming.media.id,
    };
  }

  // Default to TEXT
  if (incoming.text) {
    return {
      type: 'TEXT',
      value: incoming.text,
    };
  }

  return null;
};

export const routeIncoming = (
  session: Session,
  incoming: IncomingPayload,
  sessionRepository: SessionRepository
): RouterResult => {
  const input = convertToInput(incoming);

  // If no valid input, return current state message
  if (!input) {
    const messages = buildMessages(session);
    return { session, outgoingMessages: messages };
  }

  // Handle status command specially
  if (input.type === 'GLOBAL' && input.command === 'status') {
    const messages = buildMessages(session, { statusOnly: true });
    return { session, outgoingMessages: messages };
  }

  // Store previous state for image analysis detection
  const previousState = session.state as State;

  // Call state machine transition
  const transitionResult = transition(session, input);

  // If there's an error, don't advance state but show error message
  if (transitionResult.error) {
    const messages = buildMessages(session, {
      lastError: transitionResult.error,
    });
    return { session, outgoingMessages: messages };
  }

  // Update session from transition result
  let updatedSession = transitionResult.session;

  // Detect if image was analyzed (transitioned from WAIT_PLANT_IMAGE)
  const imageAnalyzed =
    previousState === 'WAIT_PLANT_IMAGE' && updatedSession.state !== 'WAIT_PLANT_IMAGE';

  // Build messages with context
  const ctx: MessageContext = {
    imageAnalyzed,
    previousState,
  };

  const messages = buildMessages(updatedSession, ctx);

  // Persist session
  updatedSession.updatedAt = Date.now();
  sessionRepository.upsert(updatedSession);

  return {
    session: updatedSession,
    outgoingMessages: messages,
  };
};
