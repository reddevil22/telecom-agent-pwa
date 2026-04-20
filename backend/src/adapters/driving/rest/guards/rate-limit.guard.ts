import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { RateLimiterPort } from "../../../../domain/ports/rate-limiter.port";
import { RATE_LIMITER_PORT } from "../../../../domain/tokens";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER_PORT) private readonly rateLimiter: RateLimiterPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      body?: { sessionId?: string };
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
      userId?: string;
    }>();

    request.userId = this.resolveUserId(request);

    const key = this.resolveKey(request);

    const allowed = await this.rateLimiter.isAllowed(key, Date.now());
    if (!allowed) {
      throw new HttpException(
        "Too many requests",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private resolveKey(request: { userId?: string; ip?: string }): string {
    // Authenticated requests: rate limit by authenticated user
    if (request.userId) {
      return `user:${request.userId}`;
    }
    // GET/other requests: rate limit by source IP only
    // Fall back to a shared bucket rather than bypassing rate limiting.
    return request.ip ? `ip:${request.ip}` : "unknown";
  }

  private resolveUserId(request: {
    userId?: string;
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    if (request.userId && request.userId.trim() !== "") {
      return request.userId;
    }

    const headerValue = request.headers?.["x-user-id"];
    const resolvedHeader = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;
    if (resolvedHeader && resolvedHeader.trim() !== "") {
      return resolvedHeader;
    }

    return undefined;
  }
}
