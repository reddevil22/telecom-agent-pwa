import type { LlmPort, LlmChatResponse } from '../../domain/ports/llm.port';
import type { AgentRequest, AgentResponse, ScreenType, ToolResult } from '../../domain/types/agent';
import { REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN } from '../../domain/constants/agent-constants';
import { ALLOWED_TOOLS, TOOL_ARG_SCHEMAS, SECURITY_LIMITS } from '../../domain/constants/security-constants';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ToolResolver } from './tool-resolver';
import type { PinoLogger } from 'nestjs-pino';
import type { ConversationStoragePort } from '../../domain/ports/conversation-storage.port';
import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { ScreenCachePort } from '../../domain/ports/screen-cache.port';
import type { IntentRouterPort } from '../../domain/ports/intent-router.port';
import type { IntentRouterService } from '../../domain/services/intent-router.service';
import { INTENT_TOOL_MAP, TelecomIntent, TIER1_INTENTS, INTENT_KEYWORDS } from '../../domain/types/intent';

/** Internal message type supporting tool-call and tool-result roles for the ReAct loop */
interface LoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

interface IterationContext {
  messages: LoopMessage[];
  collectedResults: ToolResult[];
  primaryResult: { screenType: ScreenType; screenData: AgentResponse['screenData']; processingSteps: AgentResponse['processingSteps'] } | null;
  conversationId: string;
}

interface ToolExecutionResult {
  toolName: string;
  screenType: ScreenType;
  screenData: AgentResponse['screenData'];
  processingSteps: AgentResponse['processingSteps'];
}

export class SupervisorService {
  private static readonly CACHEABLE_SCREENS = new Set<ScreenType>(['balance', 'bundles', 'usage', 'support', 'account']);

  private readonly toolResolver: ToolResolver;
  private readonly logger: PinoLogger | null;
  private readonly cache: ScreenCachePort | null;
  private readonly intentRouter: IntentRouterService | null;

  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
    private readonly storage: ConversationStoragePort,
    logger?: PinoLogger,
    cache?: ScreenCachePort,
    intentRouter?: IntentRouterService,
  ) {
    this.toolResolver = new ToolResolver();
    this.logger = logger ?? null;
    this.cache = cache ?? null;
    this.intentRouter = intentRouter ?? null;
    this.logger?.setContext(SupervisorService.name);
  }

  registerAgent(toolName: string, agent: SubAgentPort): void {
    this.toolResolver.register(toolName, agent);
  }

  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    try {
      // Try intent router (keyword + fuzzy cache) before LLM
      const routed = await this.tryIntentRouter(request);
      if (routed) return routed;

      // Try screen cache (previously fetched screens)
      const cached = this.tryScreenCacheHit(request);
      if (cached) return cached;

      const conversationId = this.initializeConversation(request);
      const context: IterationContext = {
        messages: this.buildInitialMessages(request),
        collectedResults: [],
        primaryResult: null,
        conversationId,
      };

      for (let iteration = 0; iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS; iteration++) {
        const result = await this.executeIteration(request, context, iteration);
        if (result) {
          this.tryCacheStore(request, result);
          this.cacheIntentResult(request, result);
          this.persistAgentResponse(conversationId, result);
          return result;
        }
      }

      return this.handleMaxIterationsReached(context);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async tryIntentRouter(request: AgentRequest): Promise<AgentResponse | null> {
    if (!this.intentRouter) return null;

    const resolution = await this.intentRouter.classify(request.prompt, request.userId);
    if (!resolution) return null;

    this.logger?.info({
      intent: resolution.intent,
      toolName: resolution.toolName,
      confidence: resolution.confidence,
      tier: resolution.confidence === 1.0 ? 'keyword' : 'fuzzy',
    }, 'Intent router resolved — skipping LLM');

    const subAgent = this.toolResolver.resolve(resolution.toolName);
    if (!subAgent) return null;

    const conversationId = this.initializeConversation(request);
    const { screenData, processingSteps } = await subAgent.handle(request.userId, resolution.args);

    const screenType = TOOL_TO_SCREEN[resolution.toolName] as ScreenType;
    const response = this.buildResponse(
      { screenType, screenData, processingSteps },
      [],
    );

    // Store in screen cache for future hits
    this.tryCacheStore(request, response);
    this.persistAgentResponse(conversationId, response);
    return response;
  }

  private tryScreenCacheHit(request: AgentRequest): AgentResponse | null {
    if (!this.cache) return null;

    // Quick keyword check to determine which screen type to look up
    const lower = request.prompt.toLowerCase();
    const matches: ScreenType[] = [];
    for (const [intentKey, keywords] of Object.entries(INTENT_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        const toolName = INTENT_TOOL_MAP[intentKey as TelecomIntent];
        const screenType = TOOL_TO_SCREEN[toolName] as ScreenType;
        if (screenType) matches.push(screenType);
      }
    }

    if (matches.length !== 1) return null;

    const cached = this.cache.get(request.userId, matches[0]);
    if (cached) {
      this.logger?.info({ screenType: matches[0] }, 'Screen cache hit');
      return {
        ...cached,
        processingSteps: [{ label: 'Retrieved from cache', status: 'done' }],
      };
    }

    return null;
  }

  private cacheIntentResult(request: AgentRequest, response: AgentResponse): void {
    if (!this.intentRouter) return;

    // Find the TelecomIntent for this screen type (reverse lookup)
    for (const [intent, toolName] of Object.entries(INTENT_TOOL_MAP)) {
      if (TOOL_TO_SCREEN[toolName] === response.screenType) {
        this.intentRouter.cacheLlmResult(request.userId, request.prompt, intent as TelecomIntent);
        return;
      }
    }
  }

  private tryCacheStore(request: AgentRequest, response: AgentResponse): void {
    if (!this.cache) return;

    if (response.screenType === 'confirmation') {
      this.cache.invalidateAll(request.userId);
      return;
    }

    if (SupervisorService.CACHEABLE_SCREENS.has(response.screenType)) {
      this.cache.set(request.userId, response.screenType, response);
    }
  }

  private initializeConversation(request: AgentRequest): string {
    const conversation = this.storage.getConversation(request.sessionId);

    if (!conversation) {
      const conversationId = this.storage.createConversation(request.sessionId, request.userId);
      this.storage.addMessage(
        conversationId,
        'user',
        request.prompt,
        null,
        request.timestamp,
      );
      return conversationId;
    }

    this.storage.addMessage(
      conversation.id,
      'user',
      request.prompt,
      null,
      request.timestamp,
    );

    return conversation.id;
  }

  private async executeIteration(
    request: AgentRequest,
    context: IterationContext,
    iteration: number,
  ): Promise<AgentResponse | null> {
    const iterStart = Date.now();
    const llmResponse = await this.callLlm(context.messages);
    const toolCall = llmResponse.message?.tool_calls?.[0];

    this.checkForInstructionLeak(iteration, llmResponse, toolCall);

    if (!toolCall) {
      return await this.handleNoToolCall(context, iteration, iterStart, llmResponse);
    }

    return await this.handleToolCall(request, context, iteration, iterStart, toolCall);
  }

  private async callLlm(messages: LoopMessage[]): Promise<LlmChatResponse> {
    return this.llm.chatCompletion({
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
  }

  private checkForInstructionLeak(
    iteration: number,
    llmResponse: LlmChatResponse,
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } } | undefined,
  ): void {
    if (llmResponse.message.content && toolCall) {
      this.logger?.warn({ iteration }, 'LLM returned text content alongside tool calls — possible instruction leak attempt');
    }
  }

  private async handleNoToolCall(
    context: IterationContext,
    iteration: number,
    iterStart: number,
    llmResponse: LlmChatResponse,
  ): Promise<AgentResponse | null> {
    if (context.primaryResult) {
      this.logger?.info({
        screenType: context.primaryResult.screenType,
        iterations: iteration + 1,
        supplementaryCount: context.collectedResults.length,
        duration: Date.now() - iterStart,
      }, 'Supervisor completed with primary result');
      return this.buildResponse(context.primaryResult, context.collectedResults);
    }

    if (llmResponse.message.content) {
      this.logger?.info({ iterations: iteration + 1 }, 'Supervisor returned unknown (LLM text response)');
      return this.buildUnknownResponse(llmResponse.message.content);
    }

    this.logger?.info({ iterations: iteration + 1 }, 'Supervisor returned unknown (no tool call, no content)');
    return this.buildUnknownResponse();
  }

  private async handleToolCall(
    request: AgentRequest,
    context: IterationContext,
    iteration: number,
    iterStart: number,
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
  ): Promise<AgentResponse | null> {
    const validationError = this.validateToolCallWithError(toolCall);
    if (validationError) {
      this.pushErrorToMessages(context.messages, toolCall, validationError);
      return null;
    }

    const screenType = this.resolveScreenType(toolCall);
    if (!screenType) {
      this.logger?.warn({ toolName: toolCall.function.name, iteration }, 'Unknown tool mapping');
      this.pushErrorToMessages(context.messages, toolCall, `Unknown tool mapping: ${toolCall.function.name}`);
      return null;
    }

    const subAgent = this.toolResolver.resolve(toolCall.function.name);
    if (!subAgent) {
      this.logger?.warn({ toolName: toolCall.function.name, iteration }, 'No handler registered for tool');
      this.pushErrorToMessages(context.messages, toolCall, `No handler registered for tool: ${toolCall.function.name}`);
      return null;
    }

    const toolResult = await this.executeSubAgent(request, subAgent, toolCall, screenType);
    this.updatePrimaryResult(context, toolResult, iteration, iterStart);

    // For screens that require user confirmation, stop here
    if (screenType === 'bundleDetail') {
      this.logger?.info({
        screenType: context.primaryResult?.screenType,
        iterations: iteration + 1,
      }, 'Supervisor pausing for user confirmation');
      return this.buildResponse(context.primaryResult!, context.collectedResults);
    }

    this.feedResultBackToLlm(context.messages, toolCall, toolResult);
    return null;
  }

  private validateToolCallWithError(
    toolCall: { function: { name: string; arguments: string } },
  ): string | null {
    if (!ALLOWED_TOOLS.has(toolCall.function.name)) {
      return 'Invalid tool call. Use only the allowed tools with correct arguments.';
    }

    const expectedKeys = TOOL_ARG_SCHEMAS[toolCall.function.name];
    if (!expectedKeys) {
      return 'Invalid tool call. Use only the allowed tools with correct arguments.';
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return 'Invalid tool call. Use only the allowed tools with correct arguments.';
    }

    const argKeys = Object.keys(args);

    for (const key of argKeys) {
      if (!expectedKeys.includes(key)) {
        return 'Invalid tool call. Use only the allowed tools with correct arguments.';
      }
    }

    for (const key of expectedKeys) {
      if (typeof args[key] !== 'string') {
        return 'Invalid tool call. Use only the allowed tools with correct arguments.';
      }
    }

    return null;
  }

  private pushErrorToMessages(
    messages: LoopMessage[],
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
    error: string,
  ): void {
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: [toolCall],
    });
    messages.push({
      role: 'tool',
      content: JSON.stringify({ error }),
      tool_call_id: toolCall.id,
    });
  }

  private resolveScreenType(
    toolCall: { function: { name: string } },
  ): ScreenType | undefined {
    return TOOL_TO_SCREEN[toolCall.function.name] as ScreenType | undefined;
  }

  private async executeSubAgent(
    request: AgentRequest,
    subAgent: SubAgentPort,
    toolCall: { function: { name: string; arguments: string } },
    screenType: ScreenType,
  ): Promise<ToolExecutionResult> {
    const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
    const { screenData, processingSteps } = await subAgent.handle(request.userId, parsedArgs);

    return {
      toolName: toolCall.function.name,
      screenType,
      screenData,
      processingSteps,
    };
  }

  private updatePrimaryResult(
    context: IterationContext,
    toolResult: ToolExecutionResult,
    iteration: number,
    iterStart: number,
  ): void {
    if (!context.primaryResult) {
      context.primaryResult = {
        screenType: toolResult.screenType,
        screenData: toolResult.screenData,
        processingSteps: toolResult.processingSteps,
      };
    } else if (toolResult.screenType === 'confirmation' && context.primaryResult.screenType !== 'confirmation') {
      // Move current primary to supplementary and make confirmation the new primary
      context.collectedResults.push({
        toolName: 'previous',
        screenType: context.primaryResult.screenType,
        screenData: context.primaryResult.screenData,
      });
      context.primaryResult = {
        screenType: toolResult.screenType,
        screenData: toolResult.screenData,
        processingSteps: toolResult.processingSteps,
      };
    } else {
      context.collectedResults.push({
        toolName: toolResult.toolName,
        screenType: toolResult.screenType,
        screenData: toolResult.screenData,
      });
    }

    this.logger?.info({
      iteration,
      toolName: toolResult.toolName,
      screenType: toolResult.screenType,
      duration: Date.now() - iterStart,
    }, 'Tool executed');
  }

  private feedResultBackToLlm(
    messages: LoopMessage[],
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
    toolResult: ToolExecutionResult,
  ): void {
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

  private handleMaxIterationsReached(context: IterationContext): AgentResponse {
    if (context.primaryResult) {
      this.logger?.warn({
        screenType: context.primaryResult.screenType,
        supplementaryCount: context.collectedResults.length,
      }, 'Supervisor hit max iterations');
      return this.buildResponse(context.primaryResult, context.collectedResults);
    }

    this.logger?.warn('Supervisor hit max iterations with no valid results');
    return this.buildUnknownResponse();
  }

  private handleError(error: unknown): AgentResponse {
    this.logger?.error({
      err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    }, 'Supervisor error processing request');
    return {
      ...this.buildUnknownResponse(),
      replyText: 'Sorry, I encountered an error processing your request. Please try again.',
    };
  }

  private buildUnknownResponse(replyText?: string): AgentResponse {
    return {
      screenType: 'unknown',
      screenData: { type: 'unknown' },
      replyText: replyText ?? REPLY_MAP.unknown,
      suggestions: SUGGESTION_MAP.unknown,
      confidence: 0.3,
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Processing', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    };
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

  private summarizeForLlm(result: ToolExecutionResult): Record<string, unknown> {
    const data = result.screenData;
    switch (data.type) {
      case 'balance':
        return { tool: result.toolName, result: 'balance_retrieved', balance: data.balance ?? null };
      case 'bundles':
        return { tool: result.toolName, result: 'bundles_listed', count: data.bundles?.length ?? 0 };
      case 'bundleDetail':
        return { tool: result.toolName, result: 'bundle_details_retrieved', bundle: data.bundle?.name ?? 'unknown' };
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

  private buildInitialMessages(request: AgentRequest): LoopMessage[] {
    const messages: LoopMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

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

    let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    while (totalChars > SECURITY_LIMITS.TOTAL_CHARS_BUDGET && messages.length > 2) {
      const removed = messages.splice(1, 1)[0];
      totalChars -= removed.content.length;
    }

    return messages;
  }
}
