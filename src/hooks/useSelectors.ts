import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../machines/orchestratorMachine';

type OrchestratorActor = ActorRefFrom<typeof orchestratorMachine>;

export const selectState = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.value;
export const selectConversationHistory = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.conversationHistory;
export const selectCurrentScreenType = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.currentScreenType;
export const selectCurrentScreenData = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.currentScreenData;
export const selectCurrentSuggestions = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.currentSuggestions;
export const selectLastAgentReply = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.lastAgentReply;
export const selectProcessingSteps = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.processingSteps;
export const selectHasReceivedFirstResponse = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.hasReceivedFirstResponse;
export const selectError = (s: ReturnType<OrchestratorActor['getSnapshot']>) => s.context.error;

export function useOrchestratorSelectors(actor: OrchestratorActor) {
  return {
    state: useSelector(actor, selectState),
    conversationHistory: useSelector(actor, selectConversationHistory),
    currentScreenType: useSelector(actor, selectCurrentScreenType),
    currentScreenData: useSelector(actor, selectCurrentScreenData),
    currentSuggestions: useSelector(actor, selectCurrentSuggestions),
    lastAgentReply: useSelector(actor, selectLastAgentReply),
    processingSteps: useSelector(actor, selectProcessingSteps),
    hasReceivedFirstResponse: useSelector(actor, selectHasReceivedFirstResponse),
    error: useSelector(actor, selectError),
  };
}
