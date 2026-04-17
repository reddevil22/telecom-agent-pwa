import type { LlmPort, LlmChatResponse } from '../../domain/ports/llm.port';
import type { AgentRequest, AgentResponse, ScreenType } from '../../domain/types/agent';
import { REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN } from '../../domain/constants/agent-constants';
import { ALLOWED_TOOLS, TOOL_ARG_SCHEMAS, SECURITY_LIMITS } from '../../domain/constants/security-constants';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ToolResolver } from './tool-resolver';
import type { PinoLogger } from 'nestjs-pino';
import type { ConversationStoragePort } from '../../domain/ports/conversation-storage.port';
import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { ScreenCachePort } from '../../domain/ports/screen-cache.port';
import type { MetricsPort } from '../../domain/ports/metrics.port';
import type { IntentRouterService } from '../../domain/services/intent-router.service';
import type { CircuitBreakerService } from '../../domain/services/circuit-breaker.service';
import { INTENT_TOOL_MAP, TelecomIntent, TIER1_INTENTS, INTENT_KEYWORDS, type IntentKeywordMap } from '../../domain/types/intent';
import { AgentErrorCode } from '../../domain/types/errors';
import { ContextManagerService } from './context-manager.service';

class LlmCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmCallError';
  }
}

/** Internal message type supporting tool-call and tool-result roles for the ReAct loop */
interface LoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

interface IterationContext {
  messages: LoopMessage[];
  primaryResult: { screenType: ScreenType; screenData: AgentResponse['screenData']; processingSteps: AgentResponse['processingSteps'] } | null;
  conversationId: string;
}

interface ToolExecutionResult {
  toolName: string;
  screenType: ScreenType;
  screenData: AgentResponse['screenData'];
  processingSteps: AgentResponse['processingSteps'];
}

interface IterationResult {
  response: AgentResponse;
  toolName?: string;
}

/** Step label emitted by the streaming generator */
type StepYield = { label: string; status: 'active' | 'done' | 'error' };

/**
 * Maps tool names to human-readable step labels for the streaming response.
 */
function getStepLabel(toolName: string): string {
  switch (toolName) {
    case 'get_balance': return 'Checking your balance';
    case 'get_bundles': return 'Finding the best bundles for you';
    case 'get_usage': return 'Reviewing your usage';
    case 'get_support': return 'Loading support options';
    case 'get_account': return 'Fetching your account';
    case 'purchase_bundle': return 'Activating your bundle';
    case 'create_ticket': return 'Creating your support ticket';
    case 'top_up': return 'Adding funds to your account';
    case 'view_bundle_details': return 'Loading bundle details';
    default: return toolName;
  }
}

export class SupervisorService {
  private static readonly CACHEABLE_SCREENS = new Set<ScreenType>(['balance', 'bundles', 'usage', 'support', 'account']);
  private static readonly CONFIRMATION_CACHE_INVALIDATION: Record<string, ScreenType[]> = {
    purchase_bundle: ['balance', 'bundles'],
    top_up: ['balance'],
    create_ticket: ['support'],
  };

  private readonly toolResolver: ToolResolver;
  private readonly logger: PinoLogger | null;
  private readonly cache: ScreenCachePort | null;
  private readonly intentRouter: IntentRouterService | null;
  private readonly circuitBreaker: CircuitBreakerService | null;
  private readonly metrics: MetricsPort | null;
  private readonly contextManager: ContextManagerService;
  private readonly intentKeywords: IntentKeywordMap;
  private readonly toolFailureCounts = new Map<string, number>();
  private readonly disabledToolsUntil = new Map<string, number>();

  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
    private readonly storage: ConversationStoragePort,
    logger?: PinoLogger,
    cache?: ScreenCachePort,
    intentRouter?: IntentRouterService,
    circuitBreaker?: CircuitBreakerService,
    intentKeywords: IntentKeywordMap = INTENT_KEYWORDS,
    metrics?: MetricsPort,
    contextManager?: ContextManagerService,
  ) {
    this.toolResolver = new ToolResolver();
    this.logger = logger ?? null;
    this.cache = cache ?? null;
    this.intentRouter = intentRouter ?? null;
    this.circuitBreaker = circuitBreaker ?? null;
    this.metrics = metrics ?? null;
    this.contextManager = contextManager ?? new ContextManagerService(this.llm, this.modelName, this.logger);
    this.intentKeywords = intentKeywords;
    this.logger?.setContext(SupervisorService.name);
  }

  /** Expose circuit breaker state for the status endpoint */
  getLlmStatus(): { available: boolean; state: string } {
    if (!this.circuitBreaker) return { available: true, state: 'closed' };
    return { available: this.circuitBreaker.isAvailable(), state: this.circuitBreaker.getState() };
  }

  registerAgent(toolName: string, agent: SubAgentPort): void {
    this.toolResolver.register(toolName, agent);
  }

  async *processRequest(request: AgentRequest): AsyncGenerator<StepYield | AgentResponse> {
    try {
      // Start: yield Analyzing request step
      yield { label: 'Analyzing request', status: 'done' };

      // Try intent router (keyword + fuzzy cache) before LLM
      let routedByIntent = false;
      for await (const routedEvent of this.tryIntentRouter(request)) {
        routedByIntent = true;
        yield routedEvent;
      }
      if (routedByIntent) {
        return;
      }

      // Try screen cache (previously fetched screens)
      const cached = this.tryScreenCacheHit(request);
      if (cached) {
        yield { label: 'Retrieving saved data', status: 'done' };
        yield cached;
        return;
      }

      // Check circuit breaker before calling LLM
      if (this.circuitBreaker && !this.circuitBreaker.isAvailable()) {
        this.logger?.warn({ state: this.circuitBreaker.getState() }, 'LLM unavailable (circuit breaker open)');
        yield { label: 'Checking service status', status: 'done' };
        const degraded = this.buildDegradedResponse();
        yield degraded;
        return;
      }

      const conversationId = this.initializeConversation(request);
      const context: IterationContext = {
        messages: await this.buildInitialMessages(request),
        primaryResult: null,
        conversationId,
      };

      for (let iteration = 0; iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS; iteration++) {
        yield { label: 'Thinking...', status: 'active' };

        const iterationResult = await this.executeIteration(request, context, iteration);

        yield { label: 'Thinking...', status: 'done' };

        if (iterationResult) {
          this.circuitBreaker?.recordSuccess();
          this.tryCacheStore(request, iterationResult.response, iterationResult.toolName);
          this.cacheIntentResult(request, iterationResult.response);
          this.persistAgentResponse(conversationId, iterationResult.response);
          yield iterationResult.response;
          return;
        }
      }

      const maxIterationsResponse = this.handleMaxIterationsReached(context);
      yield maxIterationsResponse;
    } catch (error) {
      yield { label: 'Error', status: 'error' };
      const errorResponse = this.handleError(error, error instanceof LlmCallError);
      yield errorResponse;
    }
  }

  private async *tryIntentRouter(request: AgentRequest): AsyncGenerator<StepYield | AgentResponse> {
    if (!this.intentRouter) return;

    const intentStart = Date.now();
    const resolution = await this.intentRouter.classify(request.prompt, request.userId);
    if (!resolution) {
      this.metrics?.recordCacheHit('intent', false);
      return;
    }

    this.metrics?.recordCacheHit('intent', resolution.confidence < 1.0);

    this.metrics?.recordIntentResolution(
      resolution.confidence === 1.0 ? 1 : 2,
      resolution.intent,
      Date.now() - intentStart,
    );

    this.logger?.info({
      intent: resolution.intent,
      toolName: resolution.toolName,
      confidence: resolution.confidence,
      tier: resolution.confidence === 1.0 ? 'keyword' : 'fuzzy',
    }, 'Intent router resolved — skipping LLM');

    const subAgent = this.toolResolver.resolve(resolution.toolName);
    if (!subAgent) return;

    if (this.isToolTemporarilyDisabled(request.userId, resolution.toolName)) {
      this.metrics?.recordToolBlocked(resolution.toolName);
      this.logger?.warn({ toolName: resolution.toolName, userId: request.userId }, 'Intent-routed tool is temporarily disabled');
      yield { label: getStepLabel(resolution.toolName), status: 'error' };
      yield this.buildUnknownResponse(
        'This capability is temporarily unavailable. Please try again shortly.',
        AgentErrorCode.TOOL_TEMPORARILY_UNAVAILABLE,
      );
      return;
    }

    const conversationId = this.initializeConversation(request);

    yield { label: getStepLabel(resolution.toolName), status: 'active' };

    let screenData: AgentResponse['screenData'];
    let processingSteps: AgentResponse['processingSteps'];
    const toolStart = Date.now();
    try {
      const result = await subAgent.handle(request.userId, resolution.args);
      screenData = result.screenData;
      processingSteps = result.processingSteps;
      this.recordToolSuccess(request.userId, resolution.toolName);
      this.metrics?.recordToolCall(resolution.toolName, true, Date.now() - toolStart);
    } catch (error) {
      this.recordToolFailure(request.userId, resolution.toolName);
      this.metrics?.recordToolCall(resolution.toolName, false, Date.now() - toolStart);
      this.logger?.error({
        toolName: resolution.toolName,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      }, 'Intent-routed sub-agent execution failed');
      yield { label: getStepLabel(resolution.toolName), status: 'error' };
      yield this.buildUnknownResponse('Service temporarily unavailable. Please try again.', AgentErrorCode.TOOL_FAILED);
      return;
    }

    yield { label: getStepLabel(resolution.toolName), status: 'done' };

    const screenType = TOOL_TO_SCREEN[resolution.toolName] as ScreenType;
    const response = this.buildResponse({ screenType, screenData, processingSteps });

    // Store in screen cache for future hits
    this.tryCacheStore(request, response, resolution.toolName);
    this.persistAgentResponse(conversationId, response);
    yield response;
  }

  private tryScreenCacheHit(request: AgentRequest): AgentResponse | null {
    if (!this.cache) return null;

    // Quick keyword check to determine which screen type to look up
    const lower = request.prompt.toLowerCase();
    const matches: ScreenType[] = [];
    for (const [intentKey, keywords] of Object.entries(this.intentKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        const toolName = INTENT_TOOL_MAP[intentKey as TelecomIntent];
        const screenType = TOOL_TO_SCREEN[toolName] as ScreenType;
        if (screenType) matches.push(screenType);
      }
    }

    if (matches.length !== 1) {
      this.metrics?.recordCacheHit('screen', false);
      return null;
    }

    const cached = this.cache.get(request.userId, matches[0]);
    if (cached) {
      this.metrics?.recordCacheHit('screen', true);
      this.logger?.info({ screenType: matches[0] }, 'Screen cache hit');
      return {
        ...cached,
        processingSteps: [{ label: 'Retrieved from cache', status: 'done' }],
      };
    }

    this.metrics?.recordCacheHit('screen', false);

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

  private tryCacheStore(request: AgentRequest, response: AgentResponse, toolName?: string): void {
    if (!this.cache) return;

    if (response.screenType === 'confirmation') {
      if (toolName) {
        const impactedScreens = SupervisorService.CONFIRMATION_CACHE_INVALIDATION[toolName] ?? [];
        for (const screenType of impactedScreens) {
          this.cache.invalidate(request.userId, screenType);
        }
        return;
      }

      this.cache.invalidateAll(request.userId);
      return;
    }

    if (SupervisorService.CACHEABLE_SCREENS.has(response.screenType)) {
      this.cache.set(request.userId, response.screenType, response);
    }
  }

  private initializeConversation(request: AgentRequest): string {
    const conversation = this.storage.getConversation(request.sessionId, request.userId);

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
  ): Promise<IterationResult | null> {
    const iterStart = Date.now();
    const llmResponse = await this.callLlm(context.messages, request.userId);
    const toolCall = llmResponse.message?.tool_calls?.[0];

    this.checkForInstructionLeak(iteration, llmResponse, toolCall);

    if (!toolCall) {
      return await this.handleNoToolCall(context, iteration, iterStart, llmResponse);
    }

    return await this.handleToolCall(request, context, iteration, iterStart, toolCall);
  }

  private async callLlm(messages: LoopMessage[], userId: string): Promise<LlmChatResponse> {
    try {
      const llmStart = Date.now();
      return await this.llm.chatCompletion({
        model: this.modelName,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        })),
        tools: this.getEnabledToolDefinitions(userId),
        tool_choice: 'auto',
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }).then((response) => {
        this.metrics?.recordLlmCall(
          this.modelName,
          (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
          Date.now() - llmStart,
        );
        this.metrics?.recordIntentResolution(3, 'llm_fallback', Date.now() - llmStart);
        return response;
      });
    } catch {
      throw new LlmCallError('LLM call failed');
    }
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
  ): Promise<IterationResult | null> {
    if (context.primaryResult) {
      this.logger?.info({
        screenType: context.primaryResult.screenType,
        iterations: iteration + 1,
        duration: Date.now() - iterStart,
      }, 'Supervisor completed with primary result');
      return { response: this.buildResponse(context.primaryResult) };
    }

    if (llmResponse.message.content) {
      this.logger?.info({ iterations: iteration + 1 }, 'Supervisor returned unknown (LLM text response)');
      return { response: this.buildUnknownResponse(llmResponse.message.content) };
    }

    this.logger?.info({ iterations: iteration + 1 }, 'Supervisor returned unknown (no tool call, no content)');
    return { response: this.buildUnknownResponse() };
  }

  private async handleToolCall(
    request: AgentRequest,
    context: IterationContext,
    iteration: number,
    iterStart: number,
    toolCall: { id: string; type: 'function'; function: { name: string; arguments: string } },
  ): Promise<IterationResult | null> {
    const validationError = this.validateToolCallWithError(toolCall);
    if (validationError) {
      this.pushErrorToMessages(context.messages, toolCall, validationError);
      return null;
    }

    if (this.isToolTemporarilyDisabled(request.userId, toolCall.function.name)) {
      this.metrics?.recordToolBlocked(toolCall.function.name);
      this.logger?.warn({ toolName: toolCall.function.name, userId: request.userId }, 'Tool call blocked because tool is temporarily disabled');
      return {
        response: this.buildUnknownResponse(
          'This capability is temporarily unavailable. Please try again shortly.',
          AgentErrorCode.TOOL_TEMPORARILY_UNAVAILABLE,
        ),
      };
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

    let toolResult: ToolExecutionResult;
    const toolStart = Date.now();
    try {
      toolResult = await this.executeSubAgent(request, subAgent, toolCall, screenType);
      this.recordToolSuccess(request.userId, toolCall.function.name);
      this.metrics?.recordToolCall(toolCall.function.name, true, Date.now() - toolStart);
    } catch (error) {
      this.recordToolFailure(request.userId, toolCall.function.name);
      this.metrics?.recordToolCall(toolCall.function.name, false, Date.now() - toolStart);
      this.logger?.error({
        toolName: toolCall.function.name,
        iteration,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      }, 'Sub-agent execution failed');
      return {
        response: this.buildUnknownResponse(
          'Service temporarily unavailable. Please try again.',
          AgentErrorCode.TOOL_FAILED,
        ),
      };
    }

    context.primaryResult = {
      screenType: toolResult.screenType,
      screenData: toolResult.screenData,
      processingSteps: toolResult.processingSteps,
    };

    this.logger?.info({
      iteration,
      toolName: toolResult.toolName,
      screenType: toolResult.screenType,
      duration: Date.now() - iterStart,
    }, 'Tool executed');

    // Every screen-producing tool call is terminal — return immediately.
    // Only one screen is shown at a time. The LLM should not chain calls.
    if (context.primaryResult) {
      this.logger?.info({
        screenType: context.primaryResult.screenType,
        toolName: toolResult.toolName,
        iterations: iteration + 1,
      }, 'Supervisor completed — returning single screen');
      return {
        response: this.buildResponse(context.primaryResult),
        toolName: toolResult.toolName,
      };
    }

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

  private handleMaxIterationsReached(context: IterationContext): AgentResponse {
    if (context.primaryResult) {
      this.logger?.warn({ screenType: context.primaryResult.screenType }, 'Supervisor hit max iterations');
      return this.buildResponse(context.primaryResult);
    }

    this.logger?.warn('Supervisor hit max iterations with no valid results');
    return this.buildUnknownResponse(undefined, AgentErrorCode.MAX_ITERATIONS);
  }

  private handleError(error: unknown, shouldRecordFailure = false): AgentResponse {
    if (shouldRecordFailure) {
      this.circuitBreaker?.recordFailure();
    }
    this.logger?.error({
      err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    }, 'Supervisor error processing request');
    return {
      ...this.buildUnknownResponse(undefined, shouldRecordFailure ? AgentErrorCode.LLM_UNAVAILABLE : AgentErrorCode.TOOL_FAILED),
      replyText: 'Sorry, I encountered an error processing your request. Please try again.',
    };
  }

  private buildDegradedResponse(): AgentResponse {
    return {
      screenType: 'unknown',
      screenData: { type: 'unknown' },
      replyText: 'AI chat is temporarily unavailable. Please use the quick actions below or try again shortly.',
      suggestions: ['Show my balance', 'What bundles are available?', 'Check my usage', 'I need support', 'Show my account'],
      confidence: 0.1,
      errorCode: AgentErrorCode.LLM_UNAVAILABLE,
      processingSteps: [{ label: 'Service temporarily unavailable', status: 'done' }],
    };
  }

  private buildUnknownResponse(replyText?: string, errorCode?: AgentErrorCode): AgentResponse {
    return {
      screenType: 'unknown',
      screenData: { type: 'unknown' },
      replyText: replyText ?? REPLY_MAP.unknown,
      suggestions: SUGGESTION_MAP.unknown,
      confidence: 0.3,
      ...(errorCode ? { errorCode } : {}),
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
  ): AgentResponse {
    return {
      screenType: primary.screenType,
      screenData: primary.screenData,
      replyText: REPLY_MAP[primary.screenType],
      suggestions: SUGGESTION_MAP[primary.screenType],
      confidence: 0.95,
      processingSteps: primary.processingSteps,
    };
  }

  private async buildInitialMessages(request: AgentRequest): Promise<LoopMessage[]> {
    const messages = await this.contextManager.buildMessages(request, SYSTEM_PROMPT);
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private getEnabledToolDefinitions(userId: string) {
    return TOOL_DEFINITIONS.filter((tool) => !this.isToolTemporarilyDisabled(userId, tool.function.name));
  }

  private isToolTemporarilyDisabled(userId: string, toolName: string): boolean {
    const key = this.toolKey(userId, toolName);
    const disabledUntil = this.disabledToolsUntil.get(key);
    if (!disabledUntil) return false;

    if (disabledUntil <= Date.now()) {
      this.disabledToolsUntil.delete(key);
      this.metrics?.recordToolRecovered(toolName);
      return false;
    }

    return true;
  }

  private recordToolFailure(userId: string, toolName: string): void {
    const key = this.toolKey(userId, toolName);
    const current = this.toolFailureCounts.get(key) ?? 0;
    const next = current + 1;

    if (next >= SECURITY_LIMITS.SUB_AGENT_FAILURE_THRESHOLD) {
      this.toolFailureCounts.delete(key);
      this.disabledToolsUntil.set(key, Date.now() + SECURITY_LIMITS.SUB_AGENT_DISABLE_MS);
      this.metrics?.recordToolTemporarilyDisabled(toolName);
      this.logger?.warn({
        toolName,
        userId,
        disabledForMs: SECURITY_LIMITS.SUB_AGENT_DISABLE_MS,
      }, 'Temporarily disabling tool after repeated sub-agent failures');
      return;
    }

    this.toolFailureCounts.set(key, next);
  }

  private recordToolSuccess(userId: string, toolName: string): void {
    const key = this.toolKey(userId, toolName);
    this.toolFailureCounts.delete(key);
    this.disabledToolsUntil.delete(key);
  }

  private toolKey(userId: string, toolName: string): string {
    return `${userId}:${toolName}`;
  }
}