import type { LlmPort } from '../../domain/ports/llm.port';
import type { AgentRequest, AgentResponse, ScreenType, ToolResult } from '../../domain/types/agent';
import { REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN } from '../../domain/constants/agent-constants';
import { ALLOWED_TOOLS, TOOL_ARG_SCHEMAS, SECURITY_LIMITS } from '../../domain/constants/security-constants';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ToolResolver } from './tool-resolver';
import type { PinoLogger } from 'nestjs-pino';
import type { ConversationStoragePort } from '../../domain/ports/conversation-storage.port';

/** Internal message type supporting tool-call and tool-result roles for the ReAct loop */
interface LoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

export class SupervisorService {
  private readonly toolResolver: ToolResolver;
  private readonly logger: PinoLogger | null;

  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
    private readonly storage: ConversationStoragePort,
    logger?: PinoLogger,
  ) {
    this.toolResolver = new ToolResolver();
    this.logger = logger ?? null;
    this.logger?.setContext(SupervisorService.name);
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
      // Get or create conversation
      let conversation = this.storage.getConversation(request.sessionId);
      let conversationId: string;

      if (!conversation) {
        conversationId = this.storage.createConversation(request.sessionId, request.userId);
      } else {
        conversationId = conversation.id;
      }

      // Store user message
      this.storage.addMessage(
        conversationId,
        'user',
        request.prompt,
        null,
        request.timestamp,
      );

      const messages: LoopMessage[] = this.buildInitialMessages(request);
      const collectedResults: ToolResult[] = [];
      let primaryResult: { screenType: ScreenType; screenData: AgentResponse['screenData']; processingSteps: AgentResponse['processingSteps'] } | null = null;

      for (let iteration = 0; iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS; iteration++) {
        const iterStart = Date.now();
        const llmResponse = await this.llm.chatCompletion({
          model: this.modelName,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          })),
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        });

        const toolCall = llmResponse.message?.tool_calls?.[0];

        if (llmResponse.message?.content && toolCall) {
          this.logger?.warn({ iteration }, 'LLM returned text content alongside tool calls — possible instruction leak attempt');
        }

        // No tool call — LLM is done or declined to call a tool
        if (!toolCall) {
          if (primaryResult) {
            this.logger?.info({
              screenType: primaryResult.screenType,
              iterations: iteration + 1,
              supplementaryCount: collectedResults.length,
              duration: Date.now() - iterStart,
            }, 'Supervisor completed with primary result');
            const response = this.buildResponse(primaryResult, collectedResults);
            this.persistAgentResponse(conversationId, response);
            return response;
          }
          // LLM chose to respond with text instead of calling a tool (e.g. gibberish input)
          if (llmResponse.message?.content) {
            this.logger?.info({ iterations: iteration + 1 }, 'Supervisor returned unknown (LLM text response)');
            const response = {
              ...unknownResponse,
              replyText: llmResponse.message.content,
            };
            this.persistAgentResponse(conversationId, response);
            return response;
          }
          this.logger?.info({ iterations: iteration + 1 }, 'Supervisor returned unknown (no tool call, no content)');
          const response = unknownResponse;
          this.persistAgentResponse(conversationId, response);
          return response;
        }

        // Validate tool call
        if (!this.validateToolCall(toolCall)) {
          this.logger?.warn({ toolName: toolCall.function.name, iteration }, 'Invalid tool call rejected');
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
          this.logger?.warn({ toolName: toolCall.function.name, iteration }, 'Unknown tool mapping');
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
          this.logger?.warn({ toolName: toolCall.function.name, iteration }, 'No handler registered for tool');
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
        const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
        const { screenData, processingSteps } = await subAgent.handle(request.userId, parsedArgs);

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

        this.logger?.info({
          iteration,
          toolName: toolCall.function.name,
          screenType,
          duration: Date.now() - iterStart,
        }, 'Tool executed');

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
        this.logger?.warn({
          screenType: primaryResult.screenType,
          supplementaryCount: collectedResults.length,
        }, 'Supervisor hit max iterations');
        const response = this.buildResponse(primaryResult, collectedResults);
        this.persistAgentResponse(conversationId, response);
        return response;
      }

      this.logger?.warn('Supervisor hit max iterations with no valid results');
      const response = unknownResponse;
      this.persistAgentResponse(conversationId, response);
      return response;
    } catch (error) {
      this.logger?.error({
        err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      }, 'Supervisor error processing request');
      return {
        ...unknownResponse,
        replyText: 'Sorry, I encountered an error processing your request. Please try again.',
      };
    }
  }

  private persistAgentResponse(conversationId: string, response: AgentResponse): void {
    this.storage.addMessage(
      conversationId,
      'agent',
      response.replyText,
      response.screenType,
      Date.now(),
    );
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
      case 'confirmation':
        return { tool: result.toolName, result: data.status, title: data.title, message: data.message };
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
