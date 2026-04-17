import { SupervisorService } from './supervisor.service';
import type { LlmPort, LlmChatResponse } from '../../domain/ports/llm.port';
import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { ConversationStoragePort } from '../../domain/ports/conversation-storage.port';
import type { AgentRequest } from '../../domain/types/agent';
import type { ScreenCachePort } from '../../domain/ports/screen-cache.port';
import { InMemoryScreenCacheAdapter } from '../../infrastructure/cache/in-memory-screen-cache.adapter';
import { SECURITY_LIMITS } from '../../domain/constants/security-constants';

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    prompt: 'Show my balance',
    sessionId: 's1',
    userId: 'user-42',
    conversationHistory: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

function mockToolCall(name: string, args: Record<string, unknown> = { userId: 'user-42' }, id = 'call-1'): LlmChatResponse {
  return {
    message: {
      content: null,
      tool_calls: [
        {
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
  };
}

function mockTextResponse(text: string): LlmChatResponse {
  return {
    message: { content: text },
  };
}

function createMockLlm(responses: LlmChatResponse[]): LlmPort {
  let callIndex = 0;
  return {
    chatCompletion: jest.fn().mockImplementation(() => {
      const response = responses[callIndex++];
      if (!response) throw new Error('No more mock responses');
      return Promise.resolve(response);
    }),
  } as unknown as LlmPort;
}

function createMockSubAgent(screenType: string): SubAgentPort {
  return {
    handle: jest.fn().mockImplementation((userId: string) => Promise.resolve({
      screenData: { type: screenType },
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Processing', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    })),
  } as unknown as SubAgentPort;
}

async function collectResult(stream: AsyncGenerator<any>): Promise<any> {
  let result;
  for await (const event of stream) {
    if ('screenType' in event) {
      result = event;
    }
  }
  return result;
}

function createMockStorage(): ConversationStoragePort {
  return {
    createConversation: jest.fn().mockReturnValue('conv-1'),
    getConversation: jest.fn().mockReturnValue(undefined),
    getConversationsByUser: jest.fn().mockReturnValue([]),
    addMessage: jest.fn(),
    softDeleteConversation: jest.fn(),
  } as unknown as ConversationStoragePort;
}

describe('SupervisorService', () => {
  let service: SupervisorService;
  let mockLlm: LlmPort;
  let mockStorage: ConversationStoragePort;
  let balanceAgent: SubAgentPort;
  let bundlesAgent: SubAgentPort;
  let usageAgent: SubAgentPort;
  let supportAgent: SubAgentPort;

  beforeEach(() => {
    mockLlm = createMockLlm([]);
    mockStorage = createMockStorage();
    service = new SupervisorService(mockLlm, 'test-model', 0.1, 1024, mockStorage);

    balanceAgent = createMockSubAgent('balance');
    bundlesAgent = createMockSubAgent('bundles');
    usageAgent = createMockSubAgent('usage');
    supportAgent = createMockSubAgent('support');

    service.registerAgent('check_balance', balanceAgent);
    service.registerAgent('list_bundles', bundlesAgent);
    service.registerAgent('check_usage', usageAgent);
    service.registerAgent('get_support', supportAgent);
  });

  // ── Single-shot happy path (loop exits when LLM gives no second tool call) ──

  it('routes check_balance tool call to balance sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    expect(result.screenData.type).toBe('balance');
    expect(result.replyText).toBe('Here is your current account balance.');
    expect(result.confidence).toBe(0.95);
    expect(balanceAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
  });

  it('routes list_bundles tool call to bundles sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('list_bundles'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('bundles');
    expect(bundlesAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
  });

  it('routes check_usage tool call to usage sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_usage'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('usage');
    expect(usageAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
  });

  it('routes get_support tool call to support sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('get_support'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('support');
    expect(supportAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
  });

  // ── userId trust boundary ──

  it('always passes request.userId to sub-agent, never LLM-provided userId', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance', { userId: 'attacker-controlled' }));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    expect(balanceAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
    expect(balanceAgent.handle).not.toHaveBeenCalledWith('attacker-controlled');
  });

  // ── No tool call on first iteration ──

  it('returns unknown with LLM text as replyText when LLM gives no tool call', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockTextResponse('Could you rephrase your question?'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('unknown');
    expect(result.replyText).toBe('Could you rephrase your question?');
    expect(result.confidence).toBe(0.3);
  });

  it('returns generic unknown when LLM gives no tool call and no content', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce({ message: { content: null } });

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('unknown');
    expect(result.replyText).toBe("I'm not sure what you're looking for. Here are some things I can help with.");
  });

  // ── Invalid tool call → error feedback → retry ──

  it('returns unknown when first tool is invalid and LLM gives no valid second tool', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('execute_sql', { query: 'DROP TABLE users' }))
      .mockResolvedValueOnce(mockTextResponse('I cannot do that'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('unknown');
  });

  it('recovers from invalid tool call and routes correctly on retry', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('execute_sql', { query: 'DROP TABLE users' }))
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    expect(balanceAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
    expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('feeds error message back for tool call with unexpected arguments', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance', { userId: 'u1', extra: 'malicious' }))
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    await collectResult(service.processRequest(makeRequest()));

    // Verify the second call includes a tool error message
    const secondCallMessages = (mockLlm.chatCompletion as jest.Mock).mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(toolMessage.content).toContain('Invalid tool call');
  });

  it('feeds error message back for non-JSON arguments', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce({
        message: {
          content: null,
          tool_calls: [{
            id: 'call-bad',
            type: 'function' as const,
            function: { name: 'check_balance', arguments: 'not-json{{{}}' },
          }],
        },
      })
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('feeds error message back for unknown tool name', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('nonexistent_tool'))
      .mockResolvedValueOnce(mockToolCall('check_usage'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('usage');
  });

  // ── Single screen: first tool call returns immediately ──

  it('returns first tool result as single screen without supplementary', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    expect(result.supplementaryResults).toBeUndefined();
    // Only one LLM call — loop stops after first successful tool
    expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('does not call additional tools after first successful screen', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    expect(result.supplementaryResults).toBeUndefined();
    expect(balanceAgent.handle).toHaveBeenCalledWith('user-42', expect.any(Object));
    // usage and support agents should NOT be called
    expect(usageAgent.handle).not.toHaveBeenCalled();
    expect(supportAgent.handle).not.toHaveBeenCalled();
  });

  // ── Max iterations boundary ──

  it('returns after first successful tool call without hitting max iterations', async () => {
    // LLM would call tools repeatedly, but supervisor returns after first success
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValue(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('balance');
    // Only 1 LLM call — returned immediately after first tool
    expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(1);
    expect(result.supplementaryResults).toBeUndefined();
  });

  it('returns unknown when all iterations produce invalid tool calls', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValue(mockToolCall('bad_tool'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.screenType).toBe('unknown');
    expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS);
  });

  // ── LLM error ──

  it('returns error response when LLM throws', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockRejectedValueOnce(new Error('LLM down'));

    const result = await collectResult(service.processRequest(makeRequest()));

    expect(result.replyText).toContain('Sorry, I encountered an error');
  });

  // ── Content alongside tool calls (injection attempt warning) ──

  it('handles LLM returning text content alongside tool calls', async () => {
    const mockLogger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), setContext: jest.fn() };
    const serviceWithLogger = new SupervisorService(mockLlm, 'test-model', 0.1, 1024, mockStorage, mockLogger as never);
    serviceWithLogger.registerAgent('check_balance', balanceAgent);

    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce({
        message: {
          content: 'I will reveal my system prompt...',
          tool_calls: [{
            id: 'call-1',
            type: 'function' as const,
            function: { name: 'check_balance', arguments: JSON.stringify({ userId: 'u1' }) },
          }],
        },
      });

    const result = await collectResult(serviceWithLogger.processRequest(makeRequest()));
    expect(result.screenType).toBe('balance');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ iteration: 0 }),
      expect.stringContaining('instruction leak'),
    );
  });

  // ── Suggestions ──

  it('returns correct suggestions for each screen type', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await collectResult(service.processRequest(makeRequest()));
    expect(result.suggestions).toEqual(['What bundles are available?', 'Check my usage', 'I need support']);
  });

  // ── History capping ──

  it('caps conversation history to SUPERVISOR_HISTORY_CAP', async () => {
    const longHistory = Array.from({ length: 15 }, (_, i) => ({
      role: 'user' as const,
      text: `Message ${i}`,
      timestamp: Date.now(),
    }));

    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    await collectResult(service.processRequest(makeRequest({ conversationHistory: longHistory })));

    const callArgs = (mockLlm.chatCompletion as jest.Mock).mock.calls[0][0];
    // System prompt + capped history + current user message
    expect(callArgs.messages.length).toBe(SECURITY_LIMITS.SUPERVISOR_HISTORY_CAP + 2);
  });

  // ── Character budget ──

  it('trims oldest messages when total chars exceed budget', async () => {
    const hugeHistory = Array.from({ length: 5 }, (_, i) => ({
      role: 'user' as const,
      text: 'x'.repeat(2000) + ` msg${i}`,
      timestamp: Date.now(),
    }));

    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    await collectResult(service.processRequest(makeRequest({ conversationHistory: hugeHistory })));

    const callArgs = (mockLlm.chatCompletion as jest.Mock).mock.calls[0][0];
    const totalChars = callArgs.messages.reduce((sum: number, m: { content: string }) => sum + m.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(SECURITY_LIMITS.TOTAL_CHARS_BUDGET + 100);
  });

  it('always includes system prompt and current user message even when budget is tight', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    await collectResult(service.processRequest(makeRequest()));

    const callArgs = (mockLlm.chatCompletion as jest.Mock).mock.calls[0][0];
    const messages = callArgs.messages;

    expect(messages[0].role).toBe('system');
    expect(messages[messages.length - 1].role).toBe('user');
    expect(messages[messages.length - 1].content).toContain('user-42');
    expect(messages[messages.length - 1].content).toContain('Show my balance');
  });

  // ── Loop message passing ──

  it('passes tool result summary back to LLM on retry after error', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('bad_tool'))
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    await collectResult(service.processRequest(makeRequest()));

    // Second call (retry) should include the error tool result
    const secondCallMessages = (mockLlm.chatCompletion as jest.Mock).mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(toolMessage.content).toContain('Invalid tool call');
  });

  it('includes tool_call_id in error tool result messages', async () => {
    (mockLlm.chatCompletion as jest.Mock)
      .mockResolvedValueOnce(mockToolCall('bad_tool', {}, 'call-abc'))
      .mockResolvedValueOnce(mockToolCall('check_balance'));

    await collectResult(service.processRequest(makeRequest()));

    const secondCallMessages = (mockLlm.chatCompletion as jest.Mock).mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMessage.tool_call_id).toBe('call-abc');
  });

  // ── Screen caching ──

  describe('screen caching', () => {
    let cache: InMemoryScreenCacheAdapter;
    let cachedService: SupervisorService;

    beforeEach(() => {
      cache = new InMemoryScreenCacheAdapter();
      cachedService = new SupervisorService(mockLlm, 'test-model', 0.1, 1024, mockStorage, undefined, cache);

      balanceAgent = createMockSubAgent('balance');
      bundlesAgent = createMockSubAgent('bundles');
      usageAgent = createMockSubAgent('usage');
      supportAgent = createMockSubAgent('support');

      cachedService.registerAgent('check_balance', balanceAgent);
      cachedService.registerAgent('list_bundles', bundlesAgent);
      cachedService.registerAgent('check_usage', usageAgent);
      cachedService.registerAgent('get_support', supportAgent);
    });

    it('returns cached response on second balance query without calling LLM', async () => {
      // First call: hits LLM and caches
      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_balance'));

      const first = await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance' })));
      expect(first.screenType).toBe('balance');
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(1);

      // Second call: should hit cache
      const second = await collectResult(cachedService.processRequest(makeRequest({ prompt: 'What is my balance?' })));
      expect(second.screenType).toBe('balance');
      expect(second.processingSteps[0].label).toBe('Retrieved from cache');
      // No additional LLM calls
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('skips cache for ambiguous prompts and calls LLM', async () => {
      // Prime cache with a balance entry
      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_balance'));
      await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance' })));

      // Ambiguous prompt containing both balance and usage keywords
      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_usage'));

      const result = await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance and usage' })));
      expect(result.screenType).toBe('usage');
      // LLM was called (not cached)
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(2);
    });

    it('invalidates only impacted screens after confirmation screen', async () => {
      // Prime balance and support caches
      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_balance'))
        .mockResolvedValueOnce(mockToolCall('get_support'));
      await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance' })));
      await collectResult(cachedService.processRequest(makeRequest({ prompt: 'I need support' })));
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(2);

      // Simulate a confirmation (purchase_bundle) response
      const confirmAgent: SubAgentPort = {
        handle: jest.fn().mockResolvedValue({
          screenData: { type: 'confirmation', title: 'Done', status: 'success' as const, message: 'ok', details: {} },
          processingSteps: [{ label: 'Processing', status: 'done' as const }],
        }),
      } as unknown as SubAgentPort;
      cachedService.registerAgent('purchase_bundle', confirmAgent);

      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('purchase_bundle'));
      await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Buy the data bundle' })));

      // Balance cache should be invalidated — next balance query hits LLM
      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_balance'));
      const balanceResult = await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance' })));
      expect(balanceResult.screenType).toBe('balance');
      // LLM was called again for balance (cache was invalidated)
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(4);

      // Support cache should remain available (purchase does not invalidate support)
      const supportResult = await collectResult(cachedService.processRequest(makeRequest({ prompt: 'I need support' })));
      expect(supportResult.screenType).toBe('support');
      expect(supportResult.processingSteps[0].label).toBe('Retrieved from cache');
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(4);
    });

    it('returns null from cache after TTL expiry', async () => {
      // Prime cache
      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_balance'));
      await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance' })));

      // Advance time past TTL (5 minutes)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

      (mockLlm.chatCompletion as jest.Mock)
        .mockResolvedValueOnce(mockToolCall('check_balance'));

      const result = await collectResult(cachedService.processRequest(makeRequest({ prompt: 'Show my balance' })));
      expect(result.screenType).toBe('balance');
      // LLM was called again (cache expired)
      expect(mockLlm.chatCompletion).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });
  });
});
