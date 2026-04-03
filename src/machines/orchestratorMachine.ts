import { setup, fromPromise, assign } from 'xstate';
import type { AgentRequest, AgentResponse, ProcessingStep, ScreenData, ToolResult } from '../types/agent';
import type { ConversationMessage } from '../types';
import { invokeAgentService } from '../services/agentService';

export interface OrchestratorContext {
  conversationHistory: ConversationMessage[];
  currentScreenType: string | null;
  currentScreenData: ScreenData | null;
  currentSuggestions: string[];
  lastAgentReply: string | null;
  processingSteps: ProcessingStep[];
  supplementaryResults: ToolResult[];
  hasReceivedFirstResponse: boolean;
  error: string | null;
}

export type OrchestratorEvents =
  | { type: 'SUBMIT_PROMPT'; prompt: string }
  | { type: 'RESET' };

export const orchestratorMachine = setup({
  types: {
    context: {} as OrchestratorContext,
    events: {} as OrchestratorEvents,
  },
  actors: {
    callAgent: fromPromise<
      AgentResponse,
      { prompt: string; conversationHistory: ConversationMessage[] }
    >(async ({ input }) => {
      const request: AgentRequest = {
        prompt: input.prompt,
        sessionId: 'session-1',
        userId: 'user-1',
        conversationHistory: input.conversationHistory,
        timestamp: Date.now(),
      };
      return invokeAgentService(request);
    }),
  },
}).createMachine({
  id: 'orchestrator',
  initial: 'idle',
  context: {
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
  },
  states: {
    idle: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: assign({
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'user', text: event.prompt, timestamp: Date.now() },
            ],
            error: null,
          }),
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
      invoke: {
        id: 'agentCall',
        src: 'callAgent',
        input: ({ context, event }) => {
          const submitEvent = event as Extract<OrchestratorEvents, { type: 'SUBMIT_PROMPT' }>;
          return {
            prompt: submitEvent.prompt,
            conversationHistory: context.conversationHistory,
          };
        },
        onDone: {
          target: 'rendering',
          actions: assign({
            currentScreenType: ({ event }) => event.output.screenType,
            currentScreenData: ({ event }) => event.output.screenData,
            currentSuggestions: ({ event }) => event.output.suggestions,
            lastAgentReply: ({ event }) => event.output.replyText,
            processingSteps: ({ event }) => event.output.processingSteps,
            supplementaryResults: ({ event }) => event.output.supplementaryResults ?? [],
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'agent', text: event.output.replyText, timestamp: Date.now() },
            ],
            hasReceivedFirstResponse: true,
            error: null,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => (event.error as Error).message || 'Something went wrong',
          }),
        },
      },
    },
    rendering: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: assign({
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'user', text: event.prompt, timestamp: Date.now() },
            ],
            error: null,
          }),
        },
      },
    },
    error: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: assign({
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'user', text: event.prompt, timestamp: Date.now() },
            ],
            error: null,
          }),
        },
        RESET: {
          target: 'idle',
          actions: assign({ error: null }),
        },
      },
    },
  },
});
