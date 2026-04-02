import { CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { SECURITY_LIMITS } from '../../../../domain/constants/security-constants';

interface RequestRecord {
  timestamps: number[];
}

export class RateLimitGuard implements CanActivate {
  private readonly requests = new Map<string, RequestRecord>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      SECURITY_LIMITS.RATE_LIMIT_CLEANUP_INTERVAL_MS,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ body?: { sessionId?: string } }>();
    const sessionId = request.body?.sessionId;

    if (!sessionId) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS;

    let record = this.requests.get(sessionId);
    if (!record) {
      record = { timestamps: [] };
      this.requests.set(sessionId, record);
    }

    // Prune timestamps outside the window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    record.timestamps.push(now);
    return true;
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
