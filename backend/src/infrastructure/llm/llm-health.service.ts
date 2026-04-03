import { Injectable } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';

export interface LlmHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  url: string;
  responseTime?: number;
  error?: string;
}

@Injectable()
export class LlmHealthService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: PinoLogger | null;
  private cache: LlmHealthStatus | null = null;
  private lastCheck = 0;
  private readonly cacheTtl = 5000; // 5 seconds

  constructor(
    baseUrl: string,
    apiKey: string,
    logger?: PinoLogger,
  ) {
    this.baseUrl = baseUrl.replace(/\/v1$/, ''); // Remove /v1 suffix for health check
    this.apiKey = apiKey;
    this.logger = logger ?? null;
    this.logger?.setContext(LlmHealthService.name);
  }

  checkHealth(force = false): Promise<LlmHealthStatus> {
    return this.checkHealthInternal(force);
  }

  private async checkHealthInternal(force: boolean): Promise<LlmHealthStatus> {
    const now = Date.now();

    // Return cached result if still valid
    if (!force && this.cache && (now - this.lastCheck) < this.cacheTtl) {
      return this.cache;
    }

    const startTime = Date.now();

    try {
      // Strip /v1 suffix for health check, support both localhost and 127.0.0.1
      const baseUrl = this.baseUrl.replace(/\/v1$/, '').replace('localhost', '127.0.0.1');
      const url = `${baseUrl}/health`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        this.cache = {
          status: 'healthy',
          url: baseUrl,
          responseTime,
          ...data,
        };
      } else {
        this.cache = {
          status: 'unhealthy',
          url: baseUrl,
          responseTime,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.cache = {
        status: 'unhealthy',
        url: this.baseUrl.replace(/\/v1$/, ''),
        responseTime,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }

    this.lastCheck = now;
    return this.cache!;
  }

  getStatus(): LlmHealthStatus | null {
    return this.cache;
  }
}
