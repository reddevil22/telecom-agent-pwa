import type { SubAgentPort } from '../../domain/ports/sub-agent.port';

export class ToolResolver {
  private readonly registry: Map<string, SubAgentPort> = new Map();

  register(toolName: string, agent: SubAgentPort): void {
    this.registry.set(toolName, agent);
  }

  resolve(toolName: string): SubAgentPort | undefined {
    return this.registry.get(toolName);
  }
}
