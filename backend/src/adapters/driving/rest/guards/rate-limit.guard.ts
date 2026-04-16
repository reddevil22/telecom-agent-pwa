import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { SECURITY_LIMITS } from '../../../../domain/constants/security-constants';

interface RequestRecord {
  timestamps: number[];
}

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly requests = new Map<string, RequestRecord>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      SECURITY_LIMITS.RATE_LIMIT_CLEANUP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      body?: { sessionId?: string };
      headers?: Record<string, string>;
      ip?: string;
    }>();

    const key = this.resolveKey(request);
    if (!key) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS;

    let record = this.requests.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.requests.set(key, record);
    }

    // Prune timestamps outside the window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    record.timestamps.push(now);
    return true;
  }

  private resolveKey(request: {
    body?: { sessionId?: string };
    ip?: string;
  }): string | null {
    // POST requests: rate limit by sessionId from body
    if (request.body?.sessionId) {
      return `session:${request.body.sessionId}`;
    }
    // GET/other requests: rate limit by source IP only
    return request.ip ? `ip:${request.ip}` : null;
  }

  private cleanup(): void {
    const cutoff = Date.now() - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS;
    for (const [key, record] of this.requests) {
      record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
      if (record.timestamps.length === 0) {
        this.requests.delete(key);
      }
    }
  }
}
