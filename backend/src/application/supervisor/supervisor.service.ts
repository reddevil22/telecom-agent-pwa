import type { LlmPort } from '../../domain/ports/llm.port';
import type { AgentRequest, AgentResponse, ScreenType, ToolResult } from '../../domain/types/agent';
import { REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN } from '../../domain/constants/agent-constants';
import { ALLOWED_TOOLS, TOOL_ARG_SCHEMAS, SECURITY_LIMITS } from '../../domain/constants/security-constants';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ToolResolver } from './tool-resolver';

/** Internal message type supporting tool-call and tool-result roles for the ReAct loop */
interface LoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

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
      const messages: LoopMessage[] = this.buildInitialMessages(request);
      const collectedResults: ToolResult[] = [];
      let primaryResult: { screenType: ScreenType; screenData: AgentResponse['screenData']; processingSteps: AgentResponse['processingSteps'] } | null = null;

      for (let iteration = 0; iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS; iteration++) {
        const llmResponse = await this.llm.chatCompletion({
          model: this.modelName,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          })),
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        });

        const toolCall = llmResponse.message?.tool_calls?.[0];

        if (llmResponse.message?.content) {
          console.warn('[Supervisor] LLM returned text content alongside tool calls — possible instruction leak attempt');
        }

        // No tool call — LLM is done or gave up
        if (!toolCall) {
          if (primaryResult) {
            return this.buildResponse(primaryResult, collectedResults);
          }
          return unknownResponse;
        }

        // Validate tool call
        if (!this.validateToolCall(toolCall)) {
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: 'Invalid tool call. Use only the allowed tools with correct arguments.' }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        const screenType = TOOL_TO_SCREEN[toolCall.function.name] as ScreenType | undefined;
        if (!screenType) {
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: `Unknown tool mapping: ${toolCall.function.name}` }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        const subAgent = this.toolResolver.resolve(toolCall.function.name);
        if (!subAgent) {
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify({ error: `No handler registered for tool: ${toolCall.function.name}` }),
            tool_call_id: toolCall.id,
          });
          continue;
        }

        // Execute sub-agent (always using request.userId, never LLM-provided)
        const { screenData, processingSteps } = await subAgent.handle(request.userId);

        const toolResult: ToolResult = {
          toolName: toolCall.function.name,
          screenType,
          screenData,
        };

        if (!primaryResult) {
          primaryResult = { screenType, screenData, processingSteps };
        } else {
          collectedResults.push(toolResult);
        }

        // Feed concise summary back to LLM for next iteration
        const summary = this.summarizeForLlm(toolResult);
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [toolCall],
        });
        messages.push({
          role: 'tool',
          content: JSON.stringify(summary),
          tool_call_id: toolCall.id,
        });
      }

      // Max iterations reached — return what we have
      if (primaryResult) {
        return this.buildResponse(primaryResult, collectedResults);
      }

      return unknownResponse;
    } catch {
      return {
        ...unknownResponse,
        replyText: 'Sorry, I encountered an error processing your request. Please try again.',
      };
    }
  }

  private buildResponse(
    primary: { screenType: ScreenType; screenData: AgentResponse['screenData']; processingSteps: AgentResponse['processingSteps'] },
    supplementary: ToolResult[],
  ): AgentResponse {
    return {
      screenType: primary.screenType,
      screenData: primary.screenData,
      replyText: REPLY_MAP[primary.screenType],
      suggestions: SUGGESTION_MAP[primary.screenType],
      confidence: 0.95,
      processingSteps: primary.processingSteps,
      ...(supplementary.length > 0 ? { supplementaryResults: supplementary } : {}),
    };
  }

  private summarizeForLlm(result: ToolResult): Record<string, unknown> {
    const data = result.screenData;
    switch (data.type) {
      case 'balance':
        return { tool: result.toolName, result: 'balance_retrieved', balance: data.balance ?? null };
      case 'bundles':
        return { tool: result.toolName, result: 'bundles_listed', count: data.bundles?.length ?? 0 };
      case 'usage':
        return { tool: result.toolName, result: 'usage_retrieved', entries: data.usage?.length ?? 0 };
      case 'support':
        return { tool: result.toolName, result: 'support_data_retrieved', tickets: data.tickets?.length ?? 0, faqCount: data.faqItems?.length ?? 0 };
      default:
        return { tool: result.toolName, result: 'unknown' };
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

  private buildInitialMessages(request: AgentRequest): LoopMessage[] {
    const messages: LoopMessage[] = [
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
