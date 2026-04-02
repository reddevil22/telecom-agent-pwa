import type { LlmPort } from '../../domain/ports/llm.port';
import type { AgentRequest, AgentResponse, ScreenType } from '../../domain/types/agent';
import { REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN } from '../../domain/constants/agent-constants';
import { ALLOWED_TOOLS, TOOL_ARG_SCHEMAS, SECURITY_LIMITS } from '../../domain/constants/security-constants';
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

      if (llmResponse.message?.content) {
        console.warn('[Supervisor] LLM returned text content alongside tool calls — possible instruction leak attempt');
      }

      if (!this.validateToolCall(toolCall)) {
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

  private validateToolCall(toolCall: { function: { name: string; arguments: string } }): boolean {
    if (!ALLOWED_TOOLS.has(toolCall.function.name)) {
      return false;
    }

    const expectedKeys = TOOL_ARG_SCHEMAS[toolCall.function.name];
    if (!expectedKeys) {
      return false;
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return false;
    }

    const argKeys = Object.keys(args);

    // Check for unexpected keys
    for (const key of argKeys) {
      if (!expectedKeys.includes(key)) {
        return false;
      }
    }

    // Check all required keys exist and are strings
    for (const key of expectedKeys) {
      if (typeof args[key] !== 'string') {
        return false;
      }
    }

    return true;
  }

  private buildMessages(request: AgentRequest): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Slice history to supervisor cap (inner cap, DTO allows more)
    const cappedHistory = request.conversationHistory.slice(-SECURITY_LIMITS.SUPERVISOR_HISTORY_CAP);

    for (const msg of cappedHistory) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.text,
      });
    }

    messages.push({
      role: 'user',
      content: `<user_context>\nuserId: ${request.userId}\n</user_context>\n${request.prompt}`,
    });

    // Enforce total character budget — trim oldest history messages if exceeded
    let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    while (totalChars > SECURITY_LIMITS.TOTAL_CHARS_BUDGET && messages.length > 2) {
      // Remove the oldest history message (index 1, right after system prompt)
      const removed = messages.splice(1, 1)[0];
      totalChars -= removed.content.length;
    }

    return messages;
  }
}
