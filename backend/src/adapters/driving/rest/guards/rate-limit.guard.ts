import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { RateLimiterPort } from '../../../../domain/ports/rate-limiter.port';
import { RATE_LIMITER_PORT } from '../../../../domain/tokens';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER_PORT) private readonly rateLimiter: RateLimiterPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      body?: { sessionId?: string };
      headers?: Record<string, string>;
      ip?: string;
      userId?: string;
    }>();

    const key = this.resolveKey(request);
    if (!key) {
      return true;
    }

    const allowed = await this.rateLimiter.isAllowed(key, Date.now());
    if (!allowed) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private resolveKey(request: {
    userId?: string;
    ip?: string;
  }): string | null {
    // Authenticated requests: rate limit by authenticated user
    if (request.userId) {
      return `user:${request.userId}`;
    }
    // GET/other requests: rate limit by source IP only
    return request.ip ? `ip:${request.ip}` : null;
  }

}
