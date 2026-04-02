import type { LlmPort } from '../../domain/ports/llm.port';
import type { AgentRequest, AgentResponse, ScreenType } from '../../domain/types/agent';
import { REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN } from '../../domain/constants/agent-constants';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ToolResolver } from './tool-resolver';

export class SupervisorService {
  private readonly toolResolver: ToolResolver;

  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
  ) {
    this.toolResolver = new ToolResolver();
  }

  registerAgent(toolName: string, agent: import('../../domain/ports/sub-agent.port').SubAgentPort): void {
    this.toolResolver.register(toolName, agent);
  }

  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    const unknownResponse: AgentResponse = {
      screenType: 'unknown',
      screenData: { type: 'unknown' },
      replyText: REPLY_MAP.unknown,
      suggestions: SUGGESTION_MAP.unknown,
      confidence: 0.3,
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Processing', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    };

    try {
      const messages = this.buildMessages(request);

      const llmResponse = await this.llm.chatCompletion({
        model: this.modelName,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      const toolCall = llmResponse.message?.tool_calls?.[0];
      if (!toolCall) {
        return unknownResponse;
      }

      const screenType = TOOL_TO_SCREEN[toolCall.function.name] as ScreenType | undefined;
      if (!screenType) {
        return unknownResponse;
      }

      const subAgent = this.toolResolver.resolve(toolCall.function.name);
      if (!subAgent) {
        return unknownResponse;
      }

      const { screenData, processingSteps } = await subAgent.handle(request.userId);

      return {
        screenType,
        screenData,
        replyText: REPLY_MAP[screenType],
        suggestions: SUGGESTION_MAP[screenType],
        confidence: 0.95,
        processingSteps,
      };
    } catch {
      return {
        ...unknownResponse,
        replyText: 'Sorry, I encountered an error processing your request. Please try again.',
      };
    }
  }

  private buildMessages(request: AgentRequest): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    for (const msg of request.conversationHistory) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.text,
      });
    }

    messages.push({ role: 'user', content: `[userId: ${request.userId}] ${request.prompt}` });
    return messages;
  }
}
