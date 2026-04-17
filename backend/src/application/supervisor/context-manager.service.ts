import type { PinoLogger } from 'nestjs-pino';
import type { AgentRequest } from '../../domain/types/agent';
import type { LlmPort } from '../../domain/ports/llm.port';
import { SECURITY_LIMITS } from '../../domain/constants/security-constants';

type ContextMessageRole = 'system' | 'user' | 'assistant';

export interface ContextMessage {
  role: ContextMessageRole;
  content: string;
}

interface SummaryCacheEntry {
  summary: string;
  crossedThreshold: boolean;
}

const SUMMARY_THRESHOLD_RATIO = 0.6;
const SUMMARY_RECENT_MESSAGES = 4;
const SUMMARY_MIN_OLDER_MESSAGES = 2;
const SUMMARY_MAX_TOKENS = 320;
const SUMMARY_CACHE_MAX_SESSIONS = 200;

export class ContextManagerService {
  private readonly summaryCache = new Map<string, SummaryCacheEntry>();

  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly logger: Pick<PinoLogger, 'warn'> | null,
  ) {}

  async buildMessages(request: AgentRequest, systemPrompt: string): Promise<ContextMessage[]> {
    const cappedHistory = request.conversationHistory.slice(-SECURITY_LIMITS.SUPERVISOR_HISTORY_CAP);
    const historyMessages: ContextMessage[] = cappedHistory.map((msg) => ({
      role: msg.role === 'agent' ? 'assistant' : 'user',
      content: msg.text,
    }));

    const userPromptMessage: ContextMessage = {
      role: 'user',
      content: `<user_context>\nuserId: ${request.userId}\n</user_context>\n${request.prompt}`,
    };

    const rawMessages: ContextMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      userPromptMessage,
    ];

    const thresholdChars = Math.floor(SECURITY_LIMITS.TOTAL_CHARS_BUDGET * SUMMARY_THRESHOLD_RATIO);
    const overThreshold = this.totalChars(rawMessages) > thresholdChars;
    const sessionKey = this.summaryKey(request.userId, request.sessionId);
    const cached = this.summaryCache.get(sessionKey);

    if (!overThreshold) {
      if (cached) {
        this.summaryCache.set(sessionKey, {
          ...cached,
          crossedThreshold: false,
        });
      }
      return this.enforceBudget(rawMessages, false);
    }

    const olderHistory = cappedHistory.slice(0, -SUMMARY_RECENT_MESSAGES);
    if (olderHistory.length < SUMMARY_MIN_OLDER_MESSAGES) {
      return this.enforceBudget(rawMessages, false);
    }

    let summaryText: string | undefined = cached?.summary;
    const shouldSummarize = !cached || !cached.crossedThreshold;

    if (shouldSummarize) {
      const generatedSummary = await this.summarizeHistory(olderHistory);
      if (!generatedSummary) {
        return this.enforceBudget(rawMessages, false);
      }
      summaryText = generatedSummary;
      this.trimSummaryCache();
    }

    if (summaryText) {
      this.summaryCache.set(sessionKey, {
        summary: summaryText,
        crossedThreshold: true,
      });

      const recentMessages = cappedHistory.slice(-SUMMARY_RECENT_MESSAGES).map((msg) => ({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.text,
      } satisfies ContextMessage));

      return this.enforceBudget(
        [
          { role: 'system', content: systemPrompt },
          {
            role: 'system',
            content: `Conversation summary:\n${summaryText}`,
          },
          ...recentMessages,
          userPromptMessage,
        ],
        true,
      );
    }

    return this.enforceBudget(rawMessages, false);
  }

  private async summarizeHistory(history: AgentRequest['conversationHistory']): Promise<string | null> {
    const transcript = history
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.text}`)
      .join('\n');

    try {
      const response = await this.llm.chatCompletion({
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content:
              'Summarize the telecom support conversation in 4-6 concise bullet points. Capture user intent, account state, actions already completed, and unresolved issues. Do not invent facts.',
          },
          {
            role: 'user',
            content: `Conversation transcript:\n${transcript}`,
          },
        ],
        tool_choice: 'none',
        temperature: 0.1,
        max_tokens: SUMMARY_MAX_TOKENS,
      });

      const content = response.message.content?.trim();
      if (!content) return null;
      return content.length > 1800 ? `${content.slice(0, 1797)}...` : content;
    } catch (error) {
      this.logger?.warn(
        {
          err: error instanceof Error ? { message: error.message } : String(error),
        },
        'Conversation summarization failed; falling back to raw history',
      );
      return null;
    }
  }

  private enforceBudget(messages: ContextMessage[], hasSummary: boolean): ContextMessage[] {
    const trimmed = [...messages];
    let total = this.totalChars(trimmed);

    if (!hasSummary) {
      while (total > SECURITY_LIMITS.TOTAL_CHARS_BUDGET && trimmed.length > 2) {
        const removed = trimmed.splice(1, 1)[0];
        total -= removed.content.length;
      }
      return trimmed;
    }

    while (total > SECURITY_LIMITS.TOTAL_CHARS_BUDGET && trimmed.length > 3) {
      const removed = trimmed.splice(2, 1)[0];
      total -= removed.content.length;
    }

    if (total > SECURITY_LIMITS.TOTAL_CHARS_BUDGET && trimmed.length > 2) {
      const removedSummary = trimmed.splice(1, 1)[0];
      total -= removedSummary.content.length;
    }

    return trimmed;
  }

  private totalChars(messages: ContextMessage[]): number {
    return messages.reduce((sum, message) => sum + message.content.length, 0);
  }

  private summaryKey(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  private trimSummaryCache(): void {
    while (this.summaryCache.size >= SUMMARY_CACHE_MAX_SESSIONS) {
      const oldestKey = this.summaryCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.summaryCache.delete(oldestKey);
    }
  }
}
