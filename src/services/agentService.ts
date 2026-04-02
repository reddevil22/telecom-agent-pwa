import type { AgentRequest, AgentResponse, ScreenType } from '../types/agent';
import { classifyIntent } from './intentClassifier';
import { balanceAgent } from './subAgents/balanceAgent';
import { bundlesAgent } from './subAgents/bundlesAgent';
import { usageAgent } from './subAgents/usageAgent';
import { supportAgent } from './subAgents/supportAgent';

const REPLY_MAP: Record<ScreenType, string> = {
  balance: 'Here is your current account balance.',
  bundles: 'Here are the bundles currently available for you.',
  usage: 'Here is a summary of your current usage this billing period.',
  support: 'Here are your support options and recent tickets.',
  unknown: "I'm not sure what you're looking for. Here are some things I can help with.",
};

const SUGGESTION_MAP: Record<ScreenType, string[]> = {
  balance: ['What bundles are available?', 'Check my usage', 'I need support'],
  bundles: ['Show my balance', 'Check my usage', 'Activate Value Plus'],
  usage: ['Show my balance', 'What bundles are available?', 'I need support'],
  support: ['Show my balance', 'Check my usage', 'Create a new ticket'],
  unknown: ['Show my balance', 'What bundles are available?', 'Check my usage', 'I need support'],
};

const DEFAULT_STEPS = [
  { label: 'Understanding your request', status: 'done' as const },
  { label: 'Processing', status: 'done' as const },
  { label: 'Preparing response', status: 'done' as const },
];

export async function invokeAgentService(request: AgentRequest): Promise<AgentResponse> {
  const screenType = classifyIntent(request.prompt);

  let result: { data: AgentResponse['screenData']; steps: AgentResponse['processingSteps'] };

  switch (screenType) {
    case 'balance':
      result = await balanceAgent();
      break;
    case 'bundles':
      result = await bundlesAgent();
      break;
    case 'usage':
      result = await usageAgent();
      break;
    case 'support':
      result = await supportAgent();
      break;
    default:
      result = {
        data: { type: 'unknown' },
        steps: DEFAULT_STEPS,
      };
  }

  return {
    screenType,
    screenData: result.data,
    replyText: REPLY_MAP[screenType],
    suggestions: SUGGESTION_MAP[screenType],
    confidence: screenType === 'unknown' ? 0.3 : 0.95,
    processingSteps: result.steps,
  };
}
