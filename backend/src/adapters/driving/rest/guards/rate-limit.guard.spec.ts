import { RateLimitGuard } from './rate-limit.guard';
import { SECURITY_LIMITS } from '../../../../domain/constants/security-constants';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { InMemoryRateLimiterAdapter } from '../../../../infrastructure/rate-limiter/in-memory-rate-limiter.adapter';

function makeContext(userId?: string, ip = '127.0.0.1'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        userId,
        ip,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let limiter: InMemoryRateLimiterAdapter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiterAdapter();
    guard = new RateLimitGuard(limiter);
  });

  afterEach(() => {
    limiter.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('allows request when no userId is provided (IP fallback)', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows first request for a user', async () => {
    const ctx = makeContext('user-1');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows requests up to the limit', async () => {
    const ctx = makeContext('user-1');
    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
  });

  it('blocks requests exceeding the limit', async () => {
    const ctx = makeContext('user-1');
    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      await guard.canActivate(ctx);
    }
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('tracks different users independently', async () => {
    const ctx1 = makeContext('user-1');
    const ctx2 = makeContext('user-2');

    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      await guard.canActivate(ctx1);
    }

    // user-2 should still be allowed
    await expect(guard.canActivate(ctx2)).resolves.toBe(true);
  });

  it('tracks different IP addresses independently when userId is missing', async () => {
    const ctx1 = makeContext(undefined, '10.0.0.1');
    const ctx2 = makeContext(undefined, '10.0.0.2');

    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      await guard.canActivate(ctx1);
    }

    await expect(guard.canActivate(ctx2)).resolves.toBe(true);
  });

  it('prunes old timestamps outside the window', async () => {
    const ctx = makeContext('user-1');
    const now = Date.now();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(now);

    // Fill up to limit
    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      await guard.canActivate(ctx);
    }

    // Should be blocked now
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);

    // Move time outside rate-limit window
    nowSpy.mockReturnValue(now + SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS + 1000);

    // Should be allowed again after timestamps expired
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    nowSpy.mockRestore();
  });
});
