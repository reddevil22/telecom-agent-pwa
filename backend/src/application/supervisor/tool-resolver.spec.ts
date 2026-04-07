import { ToolResolver } from './tool-resolver';
import type { SubAgentPort } from '../../domain/ports/sub-agent.port';

const mockAgent: SubAgentPort = {
  handle: jest.fn().mockResolvedValue({
    screenData: { type: 'balance' },
    processingSteps: [],
  }),
};

describe('ToolResolver', () => {
  let resolver: ToolResolver;

  beforeEach(() => {
    resolver = new ToolResolver();
  });

  it('resolves a registered tool name to its agent', () => {
    resolver.register('check_balance', mockAgent);
    expect(resolver.resolve('check_balance')).toBe(mockAgent);
  });

  it('returns undefined for unknown tool name', () => {
    resolver.register('check_balance', mockAgent);
    expect(resolver.resolve('unknown_tool')).toBeUndefined();
  });

  it('returns undefined when no tools are registered', () => {
    expect(resolver.resolve('check_balance')).toBeUndefined();
  });

  it('allows overwriting a registered agent', () => {
    const anotherAgent: SubAgentPort = {
      handle: jest.fn().mockResolvedValue({ screenData: { type: 'balance' }, processingSteps: [] }),
    };
    resolver.register('check_balance', mockAgent);
    resolver.register('check_balance', anotherAgent);
    expect(resolver.resolve('check_balance')).toBe(anotherAgent);
  });

  it('handles multiple different tool registrations', () => {
    const agent1: SubAgentPort = { handle: jest.fn() } as unknown as SubAgentPort;
    const agent2: SubAgentPort = { handle: jest.fn() } as unknown as SubAgentPort;

    resolver.register('check_balance', agent1);
    resolver.register('list_bundles', agent2);

    expect(resolver.resolve('check_balance')).toBe(agent1);
    expect(resolver.resolve('list_bundles')).toBe(agent2);
  });

  it('resolves get_account_summary to a registered agent', () => {
    const accountAgent: SubAgentPort = {
      handle: jest.fn().mockResolvedValue({
        screenData: { type: 'account' },
        processingSteps: [],
      }),
    };
    resolver.register('get_account_summary', accountAgent);
    const resolved = resolver.resolve('get_account_summary');
    expect(resolved).toBe(accountAgent);
  });
});
