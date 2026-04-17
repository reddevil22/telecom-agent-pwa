import type { LlmToolDefinition } from "../../domain/ports/llm.port";
import type { MetricsPort } from "../../domain/ports/metrics.port";
import type { PinoLogger } from "nestjs-pino";
import { SECURITY_LIMITS } from "../../domain/constants/security-constants";

export class ToolDegradationService {
  private readonly toolFailureCounts = new Map<string, number>();
  private readonly disabledToolsUntil = new Map<string, number>();

  constructor(
    private readonly logger: PinoLogger | null,
    private readonly metrics: MetricsPort | null,
  ) {}

  getEnabledToolDefinitions(
    userId: string,
    toolDefinitions: LlmToolDefinition[],
  ): LlmToolDefinition[] {
    return toolDefinitions.filter(
      (tool) => !this.isToolTemporarilyDisabled(userId, tool.function.name),
    );
  }

  isToolTemporarilyDisabled(userId: string, toolName: string): boolean {
    const key = this.toolKey(userId, toolName);
    const disabledUntil = this.disabledToolsUntil.get(key);
    if (!disabledUntil) {
      return false;
    }

    if (disabledUntil <= Date.now()) {
      this.disabledToolsUntil.delete(key);
      this.metrics?.recordToolRecovered(toolName);
      return false;
    }

    return true;
  }

  recordToolFailure(userId: string, toolName: string): void {
    const key = this.toolKey(userId, toolName);
    const current = this.toolFailureCounts.get(key) ?? 0;
    const next = current + 1;

    if (next >= SECURITY_LIMITS.SUB_AGENT_FAILURE_THRESHOLD) {
      this.toolFailureCounts.delete(key);
      this.disabledToolsUntil.set(
        key,
        Date.now() + SECURITY_LIMITS.SUB_AGENT_DISABLE_MS,
      );
      this.metrics?.recordToolTemporarilyDisabled(toolName);
      this.logger?.warn(
        {
          toolName,
          userId,
          disabledForMs: SECURITY_LIMITS.SUB_AGENT_DISABLE_MS,
        },
        "Temporarily disabling tool after repeated sub-agent failures",
      );
      return;
    }

    this.toolFailureCounts.set(key, next);
  }

  recordToolSuccess(userId: string, toolName: string): void {
    const key = this.toolKey(userId, toolName);
    this.toolFailureCounts.delete(key);
    this.disabledToolsUntil.delete(key);
  }

  private toolKey(userId: string, toolName: string): string {
    return `${userId}:${toolName}`;
  }
}
