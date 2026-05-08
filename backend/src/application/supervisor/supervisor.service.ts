import type { LlmPort, LlmChatResponse } from "../../domain/ports/llm.port";
import type {
  AgentRequest,
  AgentResponse,
  ScreenType,
} from "../../domain/types/agent";
import {
  REPLY_MAP,
  SUGGESTION_MAP,
  TOOL_TO_SCREEN,
} from "../../domain/constants/agent-constants";
import { SECURITY_LIMITS } from "../../domain/constants/security-constants";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOL_DEFINITIONS } from "./tool-definitions";
import { ToolResolver } from "./tool-resolver";
import type { PinoLogger } from "nestjs-pino";
import type { ConversationStoragePort } from "../../domain/ports/conversation-storage.port";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import type { ScreenCachePort } from "../../domain/ports/screen-cache.port";
import type { BffResponseCachePort } from "../../domain/ports/bff-response-cache.port";
import type { MetricsPort } from "../../domain/ports/metrics.port";
import type { IntentRouterService } from "../../domain/services/intent-router.service";
import type { CircuitBreakerService } from "../../domain/services/circuit-breaker.service";
import {
  INTENT_TOOL_MAP,
  TelecomIntent,
  INTENT_KEYWORDS,
  type IntentKeywordMap,
} from "../../domain/types/intent";
import { AgentErrorCode } from "../../domain/types/errors";
import { ContextManagerService } from "./context-manager.service";
import { ToolDegradationService } from "./tool-degradation.service";
import {
  ToolValidationService,
  type LoopToolMessage,
  type ToolCall,
} from "./tool-validation.service";
import { ScreenCacheManager } from "./screen-cache-manager.service";
import { randomUUID } from "crypto";
import type { DataGiftBffPort } from "../../domain/ports/bff-ports";
import { DataGiftArgsParser } from "../sub-agents/data-gift-args-parser";

class LlmCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmCallError";
  }
}

/** Internal message type supporting tool-call and tool-result roles for the LLM tool dispatch loop */
interface LoopMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface IterationContext {
  messages: LoopMessage[];
  primaryResult: {
    screenType: ScreenType;
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  } | null;
  conversationId: string;
  /** Tool result messages accumulated across loop iterations for multi-tool reasoning */
  toolResultMessages: LoopMessage[];
  /** Cumulative token usage across all LLM calls in this request */
  totalTokensUsed: number;
}

interface ToolExecutionResult {
  toolName: string;
  screenType: ScreenType;
  screenData: AgentResponse["screenData"];
  processingSteps: AgentResponse["processingSteps"];
}

type GatedToolName = "top_up" | "create_ticket" | "share_data";

interface PendingConfirmationEntry {
  token: string;
  userId: string;
  sessionId: string;
  toolName: GatedToolName;
  args: Record<string, string>;
  expiresAt: number;
}

interface ViewedBundleEntry {
  bundleId: string;
  expiresAt: number;
}

interface ConfirmationActionResult {
  response: AgentResponse;
  toolName?: string;
}

interface IterationResult {
  response: AgentResponse;
  toolName?: string;
}

/** Step label emitted by the streaming generator */
type StepYield = { label: string; status: "active" | "done" | "error" };

/**
 * Maps tool names to human-readable step labels for the streaming response.
 */
function getStepLabel(toolName: string): string {
  switch (toolName) {
    case "check_balance":
      return "Checking your balance";
    case "list_bundles":
      return "Finding the best bundles for you";
    case "check_usage":
      return "Reviewing your usage";
    case "get_support":
      return "Loading support options";
    case "get_account_summary":
      return "Fetching your account";
    case "purchase_bundle":
      return "Activating your bundle";
    case "create_ticket":
      return "Creating your support ticket";
    case "top_up":
      return "Adding funds to your account";
    case "view_bundle_details":
      return "Loading bundle details";
    default:
      return toolName;
  }
}

export class SupervisorService {
  private readonly toolResolver: ToolResolver;
  private readonly logger: PinoLogger | null;
  private readonly intentRouter: IntentRouterService | null;
  private readonly circuitBreaker: CircuitBreakerService | null;
  private readonly metrics: MetricsPort | null;
  private readonly contextManager: ContextManagerService;
  private readonly toolDegradation: ToolDegradationService;
  private readonly toolValidation: ToolValidationService;
  private readonly screenCacheManager: ScreenCacheManager;
  private readonly bffResponseCache: BffResponseCachePort | null;
  private readonly dataGiftBff: DataGiftBffPort | null;
  private readonly pendingConfirmations = new Map<
    string,
    PendingConfirmationEntry
  >();
  private readonly viewedBundles = new Map<string, ViewedBundleEntry>();

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
    toolDegradation?: ToolDegradationService,
    toolValidation?: ToolValidationService,
    screenCacheManager?: ScreenCacheManager,
    bffResponseCache?: BffResponseCachePort,
    dataGiftBff?: DataGiftBffPort,
  ) {
    this.toolResolver = new ToolResolver();
    this.logger = logger ?? null;
    this.intentRouter = intentRouter ?? null;
    this.circuitBreaker = circuitBreaker ?? null;
    this.metrics = metrics ?? null;
    this.contextManager =
      contextManager ??
      new ContextManagerService(this.llm, this.modelName, this.logger);
    this.toolDegradation =
      toolDegradation ?? new ToolDegradationService(this.logger, this.metrics);
    this.toolValidation = toolValidation ?? new ToolValidationService();
    this.screenCacheManager =
      screenCacheManager ??
      new ScreenCacheManager(
        cache ?? null,
        this.metrics,
        this.logger,
        intentKeywords,
      );
    this.dataGiftBff = dataGiftBff ?? null;
    this.bffResponseCache = bffResponseCache ?? null;
    this.logger?.setContext(SupervisorService.name);
  }

  /** Expose circuit breaker state for the status endpoint */
  getLlmStatus(): { available: boolean; state: string } {
    if (!this.circuitBreaker) return { available: true, state: "closed" };
    return {
      available: this.circuitBreaker.isAvailable(),
      state: this.circuitBreaker.getState(),
    };
  }

  registerAgent(toolName: string, agent: SubAgentPort): void {
    this.toolResolver.register(toolName, agent);
  }

  async *processRequest(
    request: AgentRequest,
  ): AsyncGenerator<StepYield | AgentResponse> {
    try {
      // Start: yield Analyzing request step
      yield { label: "Analyzing request", status: "done" };

      this.cleanupExpiredState();

      const conversationId = this.initializeConversation(request);

      const confirmationActionResult = await this.tryHandleConfirmationAction(
        request,
      );
      if (confirmationActionResult) {
        this.screenCacheManager.store(
          request,
          confirmationActionResult.response,
          confirmationActionResult.toolName,
        );
        this.persistAgentResponse(conversationId, confirmationActionResult.response);
        yield confirmationActionResult.response;
        return;
      }

      // Try intent router (keyword + fuzzy cache) before LLM
      let routedByIntent = false;
      for await (const routedEvent of this.tryIntentRouter(request, conversationId)) {
        routedByIntent = true;
        yield routedEvent;
      }
      if (routedByIntent) {
        return;
      }

      // Try screen cache (previously fetched screens)
      const cached = this.screenCacheManager.tryHit(request);
      if (cached) {
        yield { label: "Retrieving saved data", status: "done" };
        yield cached;
        return;
      }

      // Check circuit breaker before calling LLM
      if (this.circuitBreaker && !this.circuitBreaker.isAvailable()) {
        this.logger?.warn(
          { state: this.circuitBreaker.getState() },
          "LLM unavailable (circuit breaker open)",
        );
        yield { label: "Checking service status", status: "done" };
        const degraded = this.buildDegradedResponse();
        yield degraded;
        return;
      }

      const context: IterationContext = {
        messages: await this.buildInitialMessages(request),
        primaryResult: null,
        conversationId,
        toolResultMessages: [],
        totalTokensUsed: 0,
      };

      // LLM tool dispatch loop — single tool per request (safety net for retries)
      for (
        let iteration = 0;
        iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS;
        iteration++
      ) {
        yield { label: "Thinking...", status: "active" };

        const iterationResult = await this.executeIteration(
          request,
          context,
          iteration,
        );

        yield { label: "Thinking...", status: "done" };

        if (iterationResult) {
          this.circuitBreaker?.recordSuccess();
          this.screenCacheManager.store(
            request,
            iterationResult.response,
            iterationResult.toolName,
          );
          this.persistAgentResponse(conversationId, iterationResult.response);
          yield iterationResult.response;
          return;
        }
      }

      const maxIterationsResponse = this.handleMaxIterationsReached(context);
      yield maxIterationsResponse;
    } catch (error) {
      yield { label: "Error", status: "error" };
      const errorResponse = this.handleError(
        error,
        error instanceof LlmCallError,
      );
      yield errorResponse;
    }
  }

  private async *tryIntentRouter(
    request: AgentRequest,
    conversationId: string,
  ): AsyncGenerator<StepYield | AgentResponse> {
    if (!this.intentRouter) return;

    const intentStart = Date.now();
    const resolution = await this.intentRouter.classify(
      request.prompt,
      request.userId,
    );
    if (!resolution) {
      this.metrics?.recordCacheHit("intent", false);
      return;
    }

    this.metrics?.recordCacheHit("intent", resolution.confidence < 1.0);

    this.metrics?.recordIntentResolution(
      resolution.confidence === 1.0 ? 1 : 3,
      resolution.intent,
      Date.now() - intentStart,
    );

    this.logger?.info(
      {
        intent: resolution.intent,
        toolName: resolution.toolName,
        confidence: resolution.confidence,
        tier: resolution.confidence === 1.0 ? "keyword" : "llm",
      },
      "Intent router resolved — skipping LLM",
    );

    const subAgent = this.toolResolver.resolve(resolution.toolName);
    if (!subAgent) return;

    if (
      this.toolDegradation.isToolTemporarilyDisabled(
        request.userId,
        resolution.toolName,
      )
    ) {
      this.metrics?.recordToolBlocked(resolution.toolName);
      this.logger?.warn(
        { toolName: resolution.toolName, userId: request.userId },
        "Intent-routed tool is temporarily disabled",
      );
      yield { label: getStepLabel(resolution.toolName), status: "error" };
      yield this.buildUnknownResponse(
        "This capability is temporarily unavailable. Please try again shortly.",
        AgentErrorCode.TOOL_TEMPORARILY_UNAVAILABLE,
      );
      return;
    }

    yield { label: getStepLabel(resolution.toolName), status: "active" };

    let screenData: AgentResponse["screenData"];
    let processingSteps: AgentResponse["processingSteps"];
    const toolStart = Date.now();
    try {
      const result = await this.executeSubAgentCore(
        request,
        resolution.toolName,
        resolution.args,
        subAgent,
      );
      screenData = result.screenData;
      processingSteps = result.processingSteps;
      this.toolDegradation.recordToolSuccess(
        request.userId,
        resolution.toolName,
      );
      this.metrics?.recordToolCall(
        resolution.toolName,
        true,
        Date.now() - toolStart,
      );
    } catch (error) {
      this.toolDegradation.recordToolFailure(
        request.userId,
        resolution.toolName,
      );
      this.metrics?.recordToolCall(
        resolution.toolName,
        false,
        Date.now() - toolStart,
      );
      this.logger?.error(
        {
          toolName: resolution.toolName,
          err:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        },
        "Intent-routed sub-agent execution failed",
      );
      yield { label: getStepLabel(resolution.toolName), status: "error" };
      yield this.buildUnknownResponse(
        "Service temporarily unavailable. Please try again.",
        AgentErrorCode.TOOL_FAILED,
      );
      return;
    }

    yield { label: getStepLabel(resolution.toolName), status: "done" };

    const screenType = TOOL_TO_SCREEN[resolution.toolName] as ScreenType;
    const response = this.buildResponse({
      screenType,
      screenData,
      processingSteps,
    });

    // Store in screen cache for future hits
    this.screenCacheManager.store(request, response, resolution.toolName);
    this.persistAgentResponse(conversationId, response);
    yield response;
  }

  private initializeConversation(request: AgentRequest): string {
    const conversation = this.storage.getConversation(
      request.sessionId,
      request.userId,
    );

    if (!conversation) {
      const conversationId = this.storage.createConversation(
        request.sessionId,
        request.userId,
      );
      this.storage.addMessage(
        conversationId,
        "user",
        request.prompt,
        null,
        request.timestamp,
      );
      return conversationId;
    }

    this.storage.addMessage(
      conversation.id,
      "user",
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

    // ── First LLM call ──────────────────────────────────────────
    const llmResponse = await this.callLlm(context.messages, request.userId, context);
    const toolCall = llmResponse.message?.tool_calls?.[0];

    this.checkForInstructionLeak(iteration, llmResponse, toolCall);

    if (!toolCall) {
      return await this.handleNoToolCall(
        context,
        iteration,
        iterStart,
        llmResponse,
      );
    }

    // ── First tool execution ────────────────────────────────────
    const firstResult = await this.handleToolCall(
      request,
      context,
      iteration,
      iterStart,
      toolCall,
    );

    if (!firstResult) return null;
    if (firstResult.response.errorCode) return firstResult;

    const firstToolResult = this.extractToolResult(firstResult, toolCall);

    // ── Second tool call (bounded ReAct) ────────────────────────
    // Only proceed if: iteration room available, conditions met, AND token budget not exceeded
    const withinTokenBudget =
      context.totalTokensUsed < SECURITY_LIMITS.SUPERVISOR_MAX_TOKENS_PER_REQUEST;
    if (
      withinTokenBudget &&
      iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS - 1 &&
      firstToolResult &&
      this.shouldDoSecondToolCall(firstToolResult, request)
    ) {
      const toolResultMsg: LoopMessage = {
        role: "tool",
        content: JSON.stringify(firstToolResult.screenData),
        tool_call_id: toolCall.id,
      };
      context.toolResultMessages.push(toolResultMsg);

      this.logger?.info(
        { toolName: firstToolResult.toolName, iteration },
        "First tool executed — proceeding to second tool call",
      );

      // Second LLM call with first tool result visible
      const secondLlmResponse = await this.callLlm(
        [...context.messages, ...context.toolResultMessages],
        request.userId,
        context,
      );
      const secondToolCall = secondLlmResponse.message?.tool_calls?.[0];

      if (secondToolCall) {
        const secondResult = await this.handleToolCall(
          request,
          context,
          iteration + 1,
          iterStart,
          secondToolCall,
        );

        if (secondResult && !secondResult.response.errorCode) {
          const secondToolResult = this.extractToolResult(
            secondResult,
            secondToolCall,
          );
          if (secondToolResult) {
            this.logger?.info(
              {
                firstTool: firstToolResult.toolName,
                secondTool: secondToolResult.toolName,
                iteration,
              },
              "Second tool executed — returning both results",
            );
            return {
              response: this.buildResponse(
                {
                  screenType: secondToolResult.screenType,
                  screenData: secondToolResult.screenData,
                  processingSteps: secondToolResult.processingSteps,
                },
                [firstToolResult],
              ),
              toolName: secondToolResult.toolName,
            };
          }
        }
      }

      // LLM saw first result but didn't call second tool — return first result
      this.logger?.info(
        { toolName: firstToolResult.toolName, iteration },
        "First tool executed — LLM did not call second tool",
      );
      return {
        response: this.buildResponse(
          {
            screenType: firstToolResult.screenType,
            screenData: firstToolResult.screenData,
            processingSteps: firstToolResult.processingSteps,
          },
          undefined,
        ),
        toolName: firstToolResult.toolName,
      };
    }

    return firstResult;
  }

  private async callLlm(
    messages: LoopMessage[],
    userId: string,
    context: IterationContext,
  ): Promise<LlmChatResponse> {
    try {
      const llmStart = Date.now();
      const response = await this.llm.chatCompletion({
        model: this.modelName,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        })),
        tools: this.getEnabledToolDefinitions(userId),
        tool_choice: "auto",
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      const tokensUsed =
        (response.usage?.prompt_tokens ?? 0) +
        (response.usage?.completion_tokens ?? 0);
      context.totalTokensUsed += tokensUsed;

      this.metrics?.recordLlmCall(this.modelName, tokensUsed, Date.now() - llmStart);
      this.metrics?.recordIntentResolution(
        3,
        "llm_fallback",
        Date.now() - llmStart,
      );

      return response;
    } catch {
      throw new LlmCallError("LLM call failed");
    }
  }

  private checkForInstructionLeak(
    iteration: number,
    llmResponse: LlmChatResponse,
    toolCall:
      | {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }
      | undefined,
  ): void {
    if (llmResponse.message.content && toolCall) {
      this.logger?.warn(
        { iteration },
        "LLM returned text content alongside tool calls — possible instruction leak attempt",
      );
    }
  }

  private async handleNoToolCall(
    context: IterationContext,
    iteration: number,
    iterStart: number,
    llmResponse: LlmChatResponse,
  ): Promise<IterationResult | null> {
    if (context.primaryResult) {
      this.logger?.info(
        {
          screenType: context.primaryResult.screenType,
          iterations: iteration + 1,
          duration: Date.now() - iterStart,
        },
        "Supervisor completed with primary result",
      );
      return { response: this.buildResponse(context.primaryResult) };
    }

    if (llmResponse.message.content) {
      this.logger?.info(
        { iterations: iteration + 1 },
        "Supervisor returned unknown (LLM text response)",
      );
      return {
        response: this.buildUnknownResponse(llmResponse.message.content),
      };
    }

    this.logger?.info(
      { iterations: iteration + 1 },
      "Supervisor returned unknown (no tool call, no content)",
    );
    return { response: this.buildUnknownResponse() };
  }

  private async handleToolCall(
    request: AgentRequest,
    context: IterationContext,
    iteration: number,
    iterStart: number,
    toolCall: {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    },
  ): Promise<IterationResult | null> {
    const validationError = this.toolValidation.validate(toolCall);
    if (validationError) {
      this.toolValidation.pushErrorToMessages(
        context.messages as LoopToolMessage[],
        toolCall,
        validationError,
      );
      return null;
    }

    if (
      this.toolDegradation.isToolTemporarilyDisabled(
        request.userId,
        toolCall.function.name,
      )
    ) {
      this.metrics?.recordToolBlocked(toolCall.function.name);
      this.logger?.warn(
        { toolName: toolCall.function.name, userId: request.userId },
        "Tool call blocked because tool is temporarily disabled",
      );
      return {
        response: this.buildUnknownResponse(
          "This capability is temporarily unavailable. Please try again shortly.",
          AgentErrorCode.TOOL_TEMPORARILY_UNAVAILABLE,
        ),
      };
    }

    const screenType = this.resolveScreenType(toolCall);
    if (!screenType) {
      this.logger?.warn(
        { toolName: toolCall.function.name, iteration },
        "Unknown tool mapping",
      );
      this.toolValidation.pushErrorToMessages(
        context.messages as LoopToolMessage[],
        toolCall,
        `Unknown tool mapping: ${toolCall.function.name}`,
      );
      return null;
    }

    const subAgent = this.toolResolver.resolve(toolCall.function.name);
    if (!subAgent) {
      this.logger?.warn(
        { toolName: toolCall.function.name, iteration },
        "No handler registered for tool",
      );
      this.toolValidation.pushErrorToMessages(
        context.messages as LoopToolMessage[],
        toolCall,
        `No handler registered for tool: ${toolCall.function.name}`,
      );
      return null;
    }

    let toolResult: ToolExecutionResult;
    const toolStart = Date.now();
    try {
      toolResult = await this.executeSubAgent(
        request,
        subAgent,
        toolCall,
        screenType,
      );
      this.toolDegradation.recordToolSuccess(
        request.userId,
        toolCall.function.name,
      );
      this.metrics?.recordToolCall(
        toolCall.function.name,
        true,
        Date.now() - toolStart,
      );
    } catch (error) {
      this.toolDegradation.recordToolFailure(
        request.userId,
        toolCall.function.name,
      );
      this.metrics?.recordToolCall(
        toolCall.function.name,
        false,
        Date.now() - toolStart,
      );
      this.logger?.error(
        {
          toolName: toolCall.function.name,
          iteration,
          err:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        },
        "Sub-agent execution failed",
      );
      return {
        response: this.buildUnknownResponse(
          "Service temporarily unavailable. Please try again.",
          AgentErrorCode.TOOL_FAILED,
        ),
      };
    }

    context.primaryResult = {
      screenType: toolResult.screenType,
      screenData: toolResult.screenData,
      processingSteps: toolResult.processingSteps,
    };

    this.logger?.info(
      {
        iteration,
        toolName: toolResult.toolName,
        screenType: toolResult.screenType,
        duration: Date.now() - iterStart,
      },
      "Tool executed",
    );

    // Every screen-producing tool call is terminal — return immediately.
    // Only one screen is shown at a time. The LLM should not chain calls.
    if (context.primaryResult) {
      this.logger?.info(
        {
          screenType: context.primaryResult.screenType,
          toolName: toolResult.toolName,
          iterations: iteration + 1,
        },
        "Supervisor completed — returning single screen",
      );
      return {
        response: this.buildResponse(context.primaryResult),
        toolName: toolResult.toolName,
      };
    }

    return null;
  }

  private resolveScreenType(toolCall: {
    function: { name: string };
  }): ScreenType | undefined {
    return TOOL_TO_SCREEN[toolCall.function.name] as ScreenType | undefined;
  }

  /**
   * Shared sub-agent execution core: handles gated-tool confirmation,
   * purchase_bundle prerequisite, sub-agent execution, and view_bundle_details
   * marking. Returns screenData and processingSteps without toolName/screenType
   * wrapping so both executeSubAgent and tryIntentRouter can call it.
   */
  private async executeSubAgentCore(
    request: AgentRequest,
    toolName: string,
    parsedArgs: Record<string, string>,
    subAgent: SubAgentPort,
  ): Promise<{
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  }> {
    if (this.isGatedTool(toolName)) {
      return this.createPendingConfirmation(request, toolName, parsedArgs);
    }

    if (
      toolName === "purchase_bundle" &&
      !this.hasViewedBundleForSession(
        request.userId,
        request.sessionId,
        parsedArgs.bundleId,
      )
    ) {
      return this.buildPurchasePrerequisiteScreen();
    }

    // Try BFF response cache for stable read-only tools
    const cached = this.bffResponseCache?.get(request.userId, toolName);
    if (cached) {
      this.logger?.debug(
        { toolName, userId: request.userId },
        "BFF response cache hit",
      );
      return {
        screenData: cached.screenData,
        processingSteps: cached.processingSteps,
      };
    }

    const result = await subAgent.handle(request.userId, request.sessionId, parsedArgs);

    if (toolName === "view_bundle_details") {
      this.markViewedBundle(
        request.userId,
        request.sessionId,
        parsedArgs.bundleId,
      );
    }

    // Cache stable tool results for next request
    this.bffResponseCache?.set(request.userId, toolName, result as unknown as AgentResponse);

    return {
      screenData: result.screenData,
      processingSteps: result.processingSteps,
    };
  }

  private async executeSubAgent(
    request: AgentRequest,
    subAgent: SubAgentPort,
    toolCall: { function: { name: string; arguments: string } },
    screenType: ScreenType,
  ): Promise<ToolExecutionResult> {
    const parsedArgs = this.normalizeStringArgs(
      JSON.parse(toolCall.function.arguments || "{}"),
    );

    const { screenData, processingSteps } = await this.executeSubAgentCore(
      request,
      toolCall.function.name,
      parsedArgs,
      subAgent,
    );

    return {
      toolName: toolCall.function.name,
      screenType,
      screenData,
      processingSteps,
    };
  }

  private handleMaxIterationsReached(context: IterationContext): AgentResponse {
    if (context.primaryResult) {
      this.logger?.warn(
        { screenType: context.primaryResult.screenType },
        "Supervisor hit max iterations",
      );
      return this.buildResponse(context.primaryResult);
    }

    this.logger?.warn("Supervisor hit max iterations with no valid results");
    return this.buildUnknownResponse(undefined, AgentErrorCode.MAX_ITERATIONS);
  }

  private handleError(
    error: unknown,
    shouldRecordFailure = false,
  ): AgentResponse {
    if (shouldRecordFailure) {
      this.circuitBreaker?.recordFailure();
    }
    this.logger?.error(
      {
        err:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      },
      "Supervisor error processing request",
    );
    return {
      ...this.buildUnknownResponse(
        undefined,
        shouldRecordFailure
          ? AgentErrorCode.LLM_UNAVAILABLE
          : AgentErrorCode.TOOL_FAILED,
      ),
      replyText:
        "Sorry, I encountered an error processing your request. Please try again.",
    };
  }

  private buildDegradedResponse(): AgentResponse {
    return {
      screenType: "unknown",
      screenData: { type: "unknown" },
      replyText:
        "AI chat is temporarily unavailable. Please use the quick actions below or try again shortly.",
      suggestions: [
        "Show my balance",
        "What bundles are available?",
        "Check my usage",
        "I need support",
        "Show my account",
      ],
      confidence: 0.1,
      errorCode: AgentErrorCode.LLM_UNAVAILABLE,
      processingSteps: [
        { label: "Service temporarily unavailable", status: "done" },
      ],
    };
  }

  private buildUnknownResponse(
    replyText?: string,
    errorCode?: AgentErrorCode,
  ): AgentResponse {
    return {
      screenType: "unknown",
      screenData: { type: "unknown" },
      replyText: replyText ?? REPLY_MAP.unknown,
      suggestions: SUGGESTION_MAP.unknown,
      confidence: 0.3,
      ...(errorCode ? { errorCode } : {}),
      processingSteps: [
        { label: "Understanding your request", status: "done" },
        { label: "Processing", status: "done" },
        { label: "Preparing response", status: "done" },
      ],
    };
  }

  private persistAgentResponse(
    conversationId: string,
    response: AgentResponse,
  ): void {
    this.storage.addMessage(
      conversationId,
      "agent",
      response.replyText,
      response.screenType,
      Date.now(),
    );
  }

  private buildResponse(
    primary: {
      screenType: ScreenType;
      screenData: AgentResponse["screenData"];
      processingSteps: AgentResponse["processingSteps"];
    },
    supplementaryResults?: ToolExecutionResult[],
  ): AgentResponse {
    const pendingConfirmationData =
      primary.screenType === "confirmation" &&
      primary.screenData.type === "confirmation" &&
      primary.screenData.status === "pending"
        ? primary.screenData
        : null;

    return {
      screenType: primary.screenType,
      screenData: primary.screenData,
      replyText: pendingConfirmationData
        ? pendingConfirmationData.message
        : REPLY_MAP[primary.screenType],
      suggestions: pendingConfirmationData ? [] : SUGGESTION_MAP[primary.screenType],
      confidence: 0.95,
      processingSteps: primary.processingSteps,
      supplementaryResults: supplementaryResults?.map((r) => ({
        toolName: r.toolName,
        screenType: r.screenType,
        screenData: r.screenData,
      })),
    };
  }

  private isGatedTool(toolName: string): toolName is GatedToolName {
    return toolName === "top_up" || toolName === "create_ticket" || toolName === "share_data";
  }

  private createPendingConfirmation(
    request: AgentRequest,
    toolName: GatedToolName,
    args: Record<string, string>,
  ): {
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  } {
    const token = randomUUID();
    this.pendingConfirmations.set(token, {
      token,
      userId: request.userId,
      sessionId: request.sessionId,
      toolName,
      args,
      expiresAt: Date.now() + SECURITY_LIMITS.CONFIRMATION_TTL_MS,
    });

    // Data gift: resolve recipient and build rich review screen
    if (toolName === "share_data" && this.dataGiftBff) {
      return this.buildDataGiftConfirmation(request, args, token);
    }

    const details: Record<string, string | number> = {};
    if (toolName === "top_up") {
      details.amount = args.amount ?? "0";
    }
    if (toolName === "create_ticket") {
      if (args.subject) details.subject = args.subject;
    }

    return {
      screenData: {
        type: "confirmation",
        title:
          toolName === "top_up"
            ? "Confirm Top-up"
            : "Review Support Ticket",
        status: "pending",
        message:
          toolName === "top_up"
            ? "Please confirm this top-up before we process it."
            : "Please review your ticket details before submission.",
        details,
        requiresUserConfirmation: true,
        confirmationToken: token,
        actionType: toolName,
      },
      processingSteps: [
        { label: "Preparing confirmation", status: "done" },
        { label: "Awaiting confirmation", status: "active" },
      ],
    };
  }

  private buildDataGiftConfirmation(
    request: AgentRequest,
    args: Record<string, string>,
    token: string,
  ): {
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  } {
    const amountMb = DataGiftArgsParser.parseAmount(args.amount ?? "");

    return {
      screenData: {
        type: "dataGift",
        status: "pending",
        title: "Review Data Gift",
        message: `Send ${DataGiftArgsParser.formatMb(amountMb)} to ${args.recipientQuery}?`,
        details: {
          recipientName: args.recipientQuery,
          recipientMsisdn: "",
          amountMb,
          sourceBundleName: "",
          remainingMb: 0,
        },
        requiresUserConfirmation: true,
        confirmationToken: token,
        actionType: "share_data",
      } as AgentResponse["screenData"],
      processingSteps: [
        { label: "Finding recipient", status: "done" },
        { label: "Checking your allowance", status: "done" },
        { label: "Awaiting confirmation", status: "active" },
      ],
    };
  }

  /**
   * Builds a flow-gate screen that blocks purchase until the user first views
   * the bundle detail screen. This is *not* an error — it's a UX prerequisite
   * check. ConfirmationScreenData.status only supports "pending"|"success"|"error",
   * and "error" is the closest match for "action blocked pending prerequisite".
   * "pending" would incorrectly trigger the requiresUserConfirmation flow
   * (see buildResponse), which is reserved for actual confirm/cancel prompts.
   */
  private buildPurchasePrerequisiteScreen(): {
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  } {
    return {
      screenData: {
        type: "confirmation",
        title: "Action Needed",
        status: "error",
        message:
          "Please view the bundle details before you can confirm the purchase.",
        details: {},
        actionType: "purchase_bundle",
      },
      processingSteps: [{ label: "Verifying purchase flow", status: "done" }],
    };
  }

  private async tryHandleConfirmationAction(
    request: AgentRequest,
  ): Promise<ConfirmationActionResult | null> {
    const action = request.confirmationAction;
    if (!action) return null;

    const pending = this.pendingConfirmations.get(action.token);
    if (!pending || pending.expiresAt <= Date.now()) {
      this.pendingConfirmations.delete(action.token);
      return {
        response: this.buildResponse({
          screenType: "confirmation",
          screenData: {
            type: "confirmation",
            title: "Confirmation Expired",
            status: "error",
            message:
              "That confirmation is no longer valid. Please try the action again.",
            details: {},
          },
          processingSteps: [{ label: "Validating confirmation", status: "done" }],
        }),
      };
    }

    if (pending.userId !== request.userId || pending.sessionId !== request.sessionId) {
      return {
        response: this.buildUnknownResponse(
          "Invalid confirmation context for this session.",
          AgentErrorCode.TOOL_FAILED,
        ),
      };
    }

    this.pendingConfirmations.delete(action.token);

    if (action.decision === "cancel") {
      return {
        response: this.buildResponse({
          screenType: "confirmation",
          screenData: {
            type: "confirmation",
            title: "Request Cancelled",
            status: "error",
            message: "No changes were made.",
            details: {},
            actionType: pending.toolName,
          },
          processingSteps: [{ label: "Cancelling request", status: "done" }],
        }),
      };
    }

    const subAgent = this.toolResolver.resolve(pending.toolName);
    if (!subAgent) {
      return {
        response: this.buildUnknownResponse(
          "Unable to complete confirmation. Please try again.",
          AgentErrorCode.TOOL_FAILED,
        ),
      };
    }

    try {
      const toolStart = Date.now();
      const result = await subAgent.handle(request.userId, request.sessionId, pending.args);
      this.toolDegradation.recordToolSuccess(request.userId, pending.toolName);
      this.metrics?.recordToolCall(
        pending.toolName,
        true,
        Date.now() - toolStart,
      );

      // Invalidate BFF cache after write operations
      this.bffResponseCache?.invalidate(request.userId, pending.toolName);
      if (pending.toolName === "top_up") {
        this.bffResponseCache?.invalidate(request.userId, "check_balance");
        this.bffResponseCache?.invalidate(request.userId, "get_account_summary");
      }

      return {
        response: this.buildResponse({
          screenType: TOOL_TO_SCREEN[pending.toolName] as ScreenType,
          screenData: result.screenData,
          processingSteps: result.processingSteps,
        }),
        toolName: pending.toolName,
      };
    } catch (error) {
      this.toolDegradation.recordToolFailure(request.userId, pending.toolName);
      this.logger?.error(
        {
          toolName: pending.toolName,
          err:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        },
        "Confirmed sub-agent execution failed",
      );
      return {
        response: this.buildUnknownResponse(
          "Service temporarily unavailable. Please try again.",
          AgentErrorCode.TOOL_FAILED,
        ),
      };
    }
  }

  private normalizeStringArgs(args: unknown): Record<string, string> {
    if (!args || typeof args !== "object") {
      return {};
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      if (typeof value === "string") {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  private viewedBundleKey(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  private markViewedBundle(
    userId: string,
    sessionId: string,
    bundleId?: string,
  ): void {
    if (!bundleId) {
      return;
    }

    this.viewedBundles.set(this.viewedBundleKey(userId, sessionId), {
      bundleId,
      expiresAt: Date.now() + SECURITY_LIMITS.CONFIRMATION_TTL_MS,
    });
  }

  private hasViewedBundleForSession(
    userId: string,
    sessionId: string,
    bundleId?: string,
  ): boolean {
    if (!bundleId) {
      return false;
    }

    const key = this.viewedBundleKey(userId, sessionId);
    const entry = this.viewedBundles.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt <= Date.now()) {
      this.viewedBundles.delete(key);
      return false;
    }

    return entry.bundleId === bundleId;
  }

  private cleanupExpiredState(): void {
    const now = Date.now();

    for (const [token, entry] of this.pendingConfirmations.entries()) {
      if (entry.expiresAt <= now) {
        this.pendingConfirmations.delete(token);
      }
    }

    for (const [key, entry] of this.viewedBundles.entries()) {
      if (entry.expiresAt <= now) {
        this.viewedBundles.delete(key);
      }
    }
  }

  private async buildInitialMessages(
    request: AgentRequest,
  ): Promise<LoopMessage[]> {
    const messages = await this.contextManager.buildMessages(
      request,
      SYSTEM_PROMPT,
    );
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private getEnabledToolDefinitions(userId: string) {
    return this.toolDegradation.getEnabledToolDefinitions(
      userId,
      TOOL_DEFINITIONS,
    );
  }

  private extractToolResult(
    result: IterationResult,
    toolCall: { id: string; type: "function"; function: { name: string; arguments: string } },
  ): ToolExecutionResult | undefined {
    if (!result?.response) return undefined;
    return {
      toolName: result.toolName ?? toolCall.function.name,
      screenType: result.response.screenType,
      screenData: result.response.screenData,
      processingSteps: result.response.processingSteps,
    };
  }

  private shouldDoSecondToolCall(
    firstToolResult: ToolExecutionResult,
    request: AgentRequest,
  ): boolean {
    const prompt = request.prompt.toLowerCase();

    // Condition A: comparison signal + first tool was view_bundle_details
    const comparisonSignals = ["compare", "comparison", "versus", "vs", "difference", "which is better", "which one"];
    const hasComparisonSignal = comparisonSignals.some((sig) => prompt.includes(sig));
    if (hasComparisonSignal && firstToolResult.toolName === "view_bundle_details") {
      return true;
    }

    // Condition B: first tool returned pending confirmation
    if (
      firstToolResult.screenType === "confirmation" &&
      (firstToolResult.screenData as { status?: string }).status === "pending"
    ) {
      return true;
    }

    // Condition C: compound signal + first tool was check_balance or check_usage
    const compoundSignals = ["and", "also", "both", "plus", "as well"];
    const hasCompoundSignal = compoundSignals.some((sig) => prompt.includes(sig));
    if (
      hasCompoundSignal &&
      (firstToolResult.toolName === "check_balance" ||
        firstToolResult.toolName === "check_usage")
    ) {
      return true;
    }

    return false;
  }
}
