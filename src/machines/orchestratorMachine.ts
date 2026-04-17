import { setup, fromPromise, assign } from 'xstate';
import type { AgentRequest, AgentResponse, ProcessingStep, ScreenData, ToolResult } from '../types/agent';
import type { ConversationMessage } from '../types';
import { invokeAgentService, invokeAgentStream } from '../services/agentService';
import { historyService } from '../services/historyService';
import { userSessionService } from '../services/userSessionService';

function generateSessionId(userId: string): string {
  const existing = historyService.getCurrentSessionId(userId);
  if (existing) return existing;
  const newId = `session-${crypto.randomUUID()}`;
  historyService.setCurrentSessionId(newId, userId);
  return newId;
}

export interface OrchestratorContext {
  userId: string;
  conversationHistory: ConversationMessage[];
  currentScreenType: string | null;
  currentScreenData: ScreenData | null;
  currentSuggestions: string[];
  lastAgentReply: string | null;
  processingSteps: ProcessingStep[];
  supplementaryResults: ToolResult[];
  hasReceivedFirstResponse: boolean;
  error: string | null;
  sessionId: string;
}

export type OrchestratorEvents =
  | { type: 'SUBMIT_PROMPT'; prompt: string }
  | { type: 'STEP_UPDATE'; steps: ProcessingStep[] }
  | { type: 'LOAD_SESSION'; sessionId: string }
  | { type: 'SESSION_LOADED'; messages: ConversationMessage[] }
  | { type: 'NEW_SESSION' }
  | { type: 'USER_CHANGED'; userId: string }
  | { type: 'RESET' }
  | { type: 'xstate.done.actor.callAgent'; output: AgentResponse }
  | { type: 'xstate.error.actor.callAgent'; error: Error }
  | { type: 'xstate.done.actor.loadSession'; output: ConversationMessage[] }
  | { type: 'xstate.error.actor.loadSession'; error: Error };

export const orchestratorMachine = setup({
  types: {
    context: {} as OrchestratorContext,
    events: {} as OrchestratorEvents,
  },
  actors: {
    callAgent: fromPromise<
      AgentResponse,
      { prompt: string; conversationHistory: ConversationMessage[]; sessionId: string; userId: string; self: { send: (event: OrchestratorEvents) => void } | null }
    >(async ({ input, self }) => {
      const request: AgentRequest = {
        prompt: input.prompt,
        sessionId: input.sessionId,
        userId: input.userId,
        conversationHistory: input.conversationHistory,
        timestamp: Date.now(),
      };

      // Try streaming first, fall back to non-streaming
      if (self) {
        try {
          return await invokeAgentStream(request, (steps) => {
            self.send({ type: 'STEP_UPDATE', steps });
          });
        } catch {
          // Streaming failed, fall back to standard call
        }
      }

      return invokeAgentService(request);
    }),
    loadSession: fromPromise<
      ConversationMessage[],
      { sessionId: string; userId: string }
    >(async ({ input }) => {
      return historyService.loadSession(input.sessionId, input.userId);
    }),
  },
  actions: {
    addUserMessage: assign({
      conversationHistory: ({ context, event }) => {
        if (event.type !== 'SUBMIT_PROMPT') return context.conversationHistory;
        return [
          ...context.conversationHistory,
          { role: 'user' as const, text: event.prompt, timestamp: Date.now() },
        ];
      },
      error: () => null,
    }),
    setAgentResponse: assign({
      currentScreenType: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return null;
        return e.output.screenType;
      },
      currentScreenData: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return null;
        return e.output.screenData;
      },
      currentSuggestions: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return [];
        return e.output.suggestions;
      },
      lastAgentReply: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return null;
        return e.output.replyText;
      },
      processingSteps: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return [];
        return e.output.processingSteps;
      },
      supplementaryResults: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return [];
        return e.output.supplementaryResults ?? [];
      },
      conversationHistory: ({ context, event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.callAgent' }>;
        if (e.type !== 'xstate.done.actor.callAgent') return context.conversationHistory;
        return [
          ...context.conversationHistory,
          { role: 'agent' as const, text: e.output.replyText, timestamp: Date.now() },
        ];
      },
      hasReceivedFirstResponse: () => true,
      error: () => null,
    }),
    loadSessionData: assign({
      conversationHistory: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.done.actor.loadSession' }>;
        if (e.type === 'xstate.done.actor.loadSession') {
          return e.output;
        }
        return [];
      },
      currentScreenType: () => null,
      currentScreenData: () => null,
      lastAgentReply: () => null,
      processingSteps: () => [],
      supplementaryResults: () => [],
      hasReceivedFirstResponse: () => true,
    }),
    setError: assign({
      error: ({ event }) => {
        const e = event as Extract<OrchestratorEvents, { type: 'xstate.error.actor.callAgent' }>;
        return e.error instanceof Error ? e.error.message : 'Unknown error';
      },
    }),
    clearError: assign({ error: () => null }),
    resetForNewSession: assign({
      sessionId: ({ context }) => {
        const newId = `session-${crypto.randomUUID()}`;
        historyService.setCurrentSessionId(newId, context.userId);
        return newId;
      },
      conversationHistory: () => [],
      currentScreenType: () => null,
      currentScreenData: () => null,
      currentSuggestions: () => [
        'Show my balance',
        'What bundles are available?',
        'Check my usage',
        'I need support',
      ],
      lastAgentReply: () => null,
      processingSteps: () => [],
      supplementaryResults: () => [],
      hasReceivedFirstResponse: () => false,
      error: () => null,
    }),
    switchUser: assign({
      userId: ({ event, context }) => {
        if (event.type !== 'USER_CHANGED') return context.userId;
        return event.userId;
      },
      sessionId: ({ event, context }) => {
        if (event.type !== 'USER_CHANGED') return context.sessionId;
        const newId = `session-${crypto.randomUUID()}`;
        historyService.setCurrentSessionId(newId, event.userId);
        return newId;
      },
      conversationHistory: () => [],
      currentScreenType: () => null,
      currentScreenData: () => null,
      currentSuggestions: () => [
        'Show my balance',
        'What bundles are available?',
        'Check my usage',
        'I need support',
      ],
      lastAgentReply: () => null,
      processingSteps: () => [],
      supplementaryResults: () => [],
      hasReceivedFirstResponse: () => false,
      error: () => null,
    }),
    updateSteps: assign({
      processingSteps: ({ event }) => {
        if (event.type !== 'STEP_UPDATE') return [];
        return event.steps;
      },
    }),
  },
}).createMachine({
  id: 'orchestrator',
  initial: 'initializing',
  on: {
    USER_CHANGED: {
      target: 'idle',
      actions: 'switchUser',
    },
  },
  context: {
    userId: userSessionService.getSelectedUserId(),
    conversationHistory: [],
    currentScreenType: null,
    currentScreenData: null,
    currentSuggestions: [
      'Show my balance',
      'What bundles are available?',
      'Check my usage',
      'I need support',
    ],
    lastAgentReply: null,
    processingSteps: [],
    supplementaryResults: [],
    hasReceivedFirstResponse: false,
    error: null,
    sessionId: '',
  },
  states: {
    initializing: {
      entry: assign({
        sessionId: ({ context }) => generateSessionId(context.userId),
      }),
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: 'addUserMessage',
        },
        LOAD_SESSION: {
          target: 'loadingSession',
        },
        NEW_SESSION: {
          actions: 'resetForNewSession',
        },
      },
    },
    loadingSession: {
      entry: 'clearError',
      invoke: {
        src: 'loadSession',
        input: ({ context, event }) => {
          const e = event as Extract<OrchestratorEvents, { type: 'LOAD_SESSION' }>;
          return { sessionId: e.sessionId, userId: context.userId };
        },
        onDone: {
          target: 'idle',
          actions: 'loadSessionData',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    idle: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: 'addUserMessage',
        },
        LOAD_SESSION: {
          target: 'loadingSession',
        },
        NEW_SESSION: {
          actions: 'resetForNewSession',
        },
      },
    },
    processing: {
      entry: assign({
        processingSteps: [
          { label: 'Understanding your request', status: 'done' },
          { label: 'Processing', status: 'active' },
          { label: 'Preparing response', status: 'pending' },
        ],
      }),
      on: {
        STEP_UPDATE: {
          actions: 'updateSteps',
        },
      },
      invoke: {
        id: 'callAgent',
        src: 'callAgent',
        input: ({ context, event, self }) => {
          const submitEvent = event as Extract<OrchestratorEvents, { type: 'SUBMIT_PROMPT' }>;
          return {
            prompt: submitEvent.prompt,
            conversationHistory: context.conversationHistory.slice(0, -1),
            sessionId: context.sessionId,
            userId: context.userId,
            self: self ?? null,
          };
        },
        onDone: {
          target: 'rendering',
          actions: 'setAgentResponse',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    rendering: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: 'addUserMessage',
        },
        LOAD_SESSION: {
          target: 'loadingSession',
        },
        NEW_SESSION: {
          target: 'idle',
          actions: 'resetForNewSession',
        },
      },
    },
    error: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: ['addUserMessage', 'clearError'],
        },
        RESET: {
          target: 'idle',
          actions: 'clearError',
        },
        LOAD_SESSION: {
          target: 'loadingSession',
          actions: 'clearError',
        },
      },
    },
  },
});
