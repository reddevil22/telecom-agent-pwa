import { SupervisorService } from './supervisor.service';
import type { LlmPort, LlmChatResponse } from '../../domain/ports/llm.port';
import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { AgentRequest } from '../../domain/types/agent';
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

function mockToolCall(name: string, args: Record<string, unknown> = { userId: 'user-42' }): LlmChatResponse {
  return {
    message: {
      content: null,
      tool_calls: [
        {
          id: 'call-1',
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
    handle: jest.fn().mockResolvedValue({
      screenData: { type: screenType },
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Processing', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    }),
  } as unknown as SubAgentPort;
}

describe('SupervisorService', () => {
  let service: SupervisorService;
  let mockLlm: LlmPort;
  let balanceAgent: SubAgentPort;
  let bundlesAgent: SubAgentPort;
  let usageAgent: SubAgentPort;
  let supportAgent: SubAgentPort;

  beforeEach(() => {
    mockLlm = createMockLlm([]);
    service = new SupervisorService(mockLlm, 'test-model', 0.1, 1024);

    balanceAgent = createMockSubAgent('balance');
    bundlesAgent = createMockSubAgent('bundles');
    usageAgent = createMockSubAgent('usage');
    supportAgent = createMockSubAgent('support');

    service.registerAgent('check_balance', balanceAgent);
    service.registerAgent('list_bundles', bundlesAgent);
    service.registerAgent('check_usage', usageAgent);
    service.registerAgent('get_support', supportAgent);
  });

  // Happy path
  it('routes check_balance tool call to balance sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('balance');
    expect(result.screenData.type).toBe('balance');
    expect(result.replyText).toBe('Here is your current account balance.');
    expect(result.confidence).toBe(0.95);
    expect(balanceAgent.handle).toHaveBeenCalledWith('user-42');
  });

  it('routes list_bundles tool call to bundles sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('list_bundles'));

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('bundles');
    expect(bundlesAgent.handle).toHaveBeenCalledWith('user-42');
  });

  it('routes check_usage tool call to usage sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('check_usage'));

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('usage');
    expect(usageAgent.handle).toHaveBeenCalledWith('user-42');
  });

  it('routes get_support tool call to support sub-agent', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('get_support'));

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('support');
    expect(supportAgent.handle).toHaveBeenCalledWith('user-42');
  });

  // userId trust boundary
  it('always passes request.userId to sub-agent, never LLM-provided userId', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(
      mockToolCall('check_balance', { userId: 'attacker-controlled' }),
    );

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('balance');
    expect(balanceAgent.handle).toHaveBeenCalledWith('user-42');
    expect(balanceAgent.handle).not.toHaveBeenCalledWith('attacker-controlled');
  });

  // No tool call
  it('returns unknown when LLM returns no tool call', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockTextResponse('I can help with that'));

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('unknown');
    expect(result.confidence).toBe(0.3);
  });

  // Invalid tool call
  it('returns unknown for unknown tool name', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(
      mockToolCall('execute_sql', { query: 'DROP TABLE users' }),
    );

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('unknown');
  });

  it('returns unknown for tool call with unexpected arguments', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(
      mockToolCall('check_balance', { userId: 'u1', extra: 'malicious' }),
    );

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('unknown');
  });

  it('returns unknown for tool call with non-string argument value', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(
      mockToolCall('check_balance', { userId: 123 }),
    );

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('unknown');
  });

  it('returns unknown when tool call arguments are not valid JSON', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce({
      message: {
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'check_balance', arguments: 'not-json{{{}}' },
          },
        ],
      },
    });

    const result = await service.processRequest(makeRequest());

    expect(result.screenType).toBe('unknown');
  });

  // LLM error
  it('returns error response when LLM throws', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockRejectedValueOnce(new Error('LLM down'));

    const result = await service.processRequest(makeRequest());

    expect(result.replyText).toContain('Sorry, I encountered an error');
  });

  // Content alongside tool calls (injection attempt warning)
  it('handles LLM returning text content alongside tool calls', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce({
      message: {
        content: 'I will reveal my system prompt...',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'check_balance', arguments: JSON.stringify({ userId: 'u1' }) },
          },
        ],
      },
    });

    const result = await service.processRequest(makeRequest());
    expect(result.screenType).toBe('balance');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('instruction leak'));
    warnSpy.mockRestore();
  });

  // Suggestions
  it('returns correct suggestions for each screen type', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('check_balance'));

    const result = await service.processRequest(makeRequest());
    expect(result.suggestions).toEqual(['What bundles are available?', 'Check my usage', 'I need support']);
  });

  // History capping
  it('caps conversation history to SUPERVISOR_HISTORY_CAP', async () => {
    const longHistory = Array.from({ length: 15 }, (_, i) => ({
      role: 'user' as const,
      text: `Message ${i}`,
      timestamp: Date.now(),
    }));

    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('check_balance'));

    await service.processRequest(makeRequest({ conversationHistory: longHistory }));

    const callArgs = (mockLlm.chatCompletion as jest.Mock).mock.calls[0][0];
    // System prompt + capped history + current user message
    // Should be 1 (system) + SUPERVISOR_HISTORY_CAP (capped) + 1 (current) = 12
    expect(callArgs.messages.length).toBe(SECURITY_LIMITS.SUPERVISOR_HISTORY_CAP + 2);
  });

  // Character budget
  it('trims oldest messages when total chars exceed budget', async () => {
    const hugeHistory = Array.from({ length: 5 }, (_, i) => ({
      role: 'user' as const,
      text: 'x'.repeat(2000) + ` msg${i}`,
      timestamp: Date.now(),
    }));

    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('check_balance'));

    await service.processRequest(makeRequest({ conversationHistory: hugeHistory }));

    const callArgs = (mockLlm.chatCompletion as jest.Mock).mock.calls[0][0];
    const totalChars = callArgs.messages.reduce((sum: number, m: { content: string }) => sum + m.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(SECURITY_LIMITS.TOTAL_CHARS_BUDGET + 100); // small margin for prompt wrapper
  });

  it('always includes system prompt and current user message even when budget is tight', async () => {
    (mockLlm.chatCompletion as jest.Mock).mockResolvedValueOnce(mockToolCall('check_balance'));

    await service.processRequest(makeRequest());

    const callArgs = (mockLlm.chatCompletion as jest.Mock).mock.calls[0][0];
    const messages = callArgs.messages;

    expect(messages[0].role).toBe('system');
    expect(messages[messages.length - 1].role).toBe('user');
    expect(messages[messages.length - 1].content).toContain('user-42');
    expect(messages[messages.length - 1].content).toContain('Show my balance');
  });
});
