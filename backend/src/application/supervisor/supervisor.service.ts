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

class LlmCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmCallError";
  }
}

/** Internal message type supporting tool-call and tool-result roles for the ReAct loop */
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
}

interface ToolExecutionResult {
  toolName: string;
  screenType: ScreenType;
  screenData: AgentResponse["screenData"];
  processingSteps: AgentResponse["processingSteps"];
}

type GatedToolName = "top_up" | "create_ticket";

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
    case "get_balance":
      return "Checking your balance";
    case "get_bundles":
      return "Finding the best bundles for you";
    case "get_usage":
      return "Reviewing your usage";
    case "get_support":
      return "Loading support options";
    case "get_account":
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
      };

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
          this.cacheIntentResult(request, iterationResult.response);
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
      resolution.confidence === 1.0 ? 1 : 2,
      resolution.intent,
      Date.now() - intentStart,
    );

    this.logger?.info(
      {
        intent: resolution.intent,
        toolName: resolution.toolName,
        confidence: resolution.confidence,
        tier: resolution.confidence === 1.0 ? "keyword" : "fuzzy",
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
      if (this.isGatedTool(resolution.toolName)) {
        const gated = this.createPendingConfirmation(
          request,
          resolution.toolName,
          this.normalizeStringArgs(resolution.args),
        );
        screenData = gated.screenData;
        processingSteps = gated.processingSteps;
      } else if (
        resolution.toolName === "purchase_bundle" &&
        !this.hasViewedBundleForSession(
          request.userId,
          request.sessionId,
          resolution.args.bundleId,
        )
      ) {
        const blocked = this.buildPurchasePrerequisiteScreen();
        screenData = blocked.screenData;
        processingSteps = blocked.processingSteps;
      } else {
        const result = await subAgent.handle(request.userId, resolution.args);
        screenData = result.screenData;
        processingSteps = result.processingSteps;

        if (resolution.toolName === "view_bundle_details") {
          this.markViewedBundle(
            request.userId,
            request.sessionId,
            resolution.args.bundleId,
          );
        }
      }
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

  private cacheIntentResult(
    request: AgentRequest,
    response: AgentResponse,
  ): void {
    if (!this.intentRouter) return;

    // Find the TelecomIntent for this screen type (reverse lookup)
    for (const [intent, toolName] of Object.entries(INTENT_TOOL_MAP)) {
      if (TOOL_TO_SCREEN[toolName] === response.screenType) {
        this.intentRouter.cacheLlmResult(
          request.userId,
          request.prompt,
          intent as TelecomIntent,
        );
        return;
      }
    }
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
    const llmResponse = await this.callLlm(context.messages, request.userId);
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

    return await this.handleToolCall(
      request,
      context,
      iteration,
      iterStart,
      toolCall,
    );
  }

  private async callLlm(
    messages: LoopMessage[],
    userId: string,
  ): Promise<LlmChatResponse> {
    try {
      const llmStart = Date.now();
      return await this.llm
        .chatCompletion({
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
        })
        .then((response) => {
          this.metrics?.recordLlmCall(
            this.modelName,
            (response.usage?.prompt_tokens ?? 0) +
              (response.usage?.completion_tokens ?? 0),
            Date.now() - llmStart,
          );
          this.metrics?.recordIntentResolution(
            3,
            "llm_fallback",
            Date.now() - llmStart,
          );
          return response;
        });
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

  private async executeSubAgent(
    request: AgentRequest,
    subAgent: SubAgentPort,
    toolCall: { function: { name: string; arguments: string } },
    screenType: ScreenType,
  ): Promise<ToolExecutionResult> {
    const parsedArgs = this.normalizeStringArgs(
      JSON.parse(toolCall.function.arguments || "{}"),
    );

    if (this.isGatedTool(toolCall.function.name)) {
      const gated = this.createPendingConfirmation(
        request,
        toolCall.function.name,
        parsedArgs,
      );
      return {
        toolName: toolCall.function.name,
        screenType,
        screenData: gated.screenData,
        processingSteps: gated.processingSteps,
      };
    }

    if (
      toolCall.function.name === "purchase_bundle" &&
      !this.hasViewedBundleForSession(
        request.userId,
        request.sessionId,
        parsedArgs.bundleId,
      )
    ) {
      const blocked = this.buildPurchasePrerequisiteScreen();
      return {
        toolName: toolCall.function.name,
        screenType,
        screenData: blocked.screenData,
        processingSteps: blocked.processingSteps,
      };
    }

    const { screenData, processingSteps } = await subAgent.handle(
      request.userId,
      parsedArgs,
    );

    if (toolCall.function.name === "view_bundle_details") {
      this.markViewedBundle(
        request.userId,
        request.sessionId,
        parsedArgs.bundleId,
      );
    }

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

  private buildResponse(primary: {
    screenType: ScreenType;
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  }): AgentResponse {
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
    };
  }

  private isGatedTool(toolName: string): toolName is GatedToolName {
    return toolName === "top_up" || toolName === "create_ticket";
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

  private buildPurchasePrerequisiteScreen(): {
    screenData: AgentResponse["screenData"];
    processingSteps: AgentResponse["processingSteps"];
  } {
    return {
      screenData: {
        type: "confirmation",
        title: "Review Required",
        status: "error",
        message:
          "Please view bundle details before confirming the purchase.",
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
      const result = await subAgent.handle(request.userId, pending.args);
      this.toolDegradation.recordToolSuccess(request.userId, pending.toolName);
      this.metrics?.recordToolCall(
        pending.toolName,
        true,
        Date.now() - toolStart,
      );

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
}
